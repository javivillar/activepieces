import {
  ApErrorParams,
  ErrorCode,
  RefresquitoSecretManagerConnectionWithStatus,
  RefresquitoSecretManagerScope,
  UpsertRefresquitoSecretManagerConnectionRequest,
} from '@activepieces/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { t } from 'i18next';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ProjectSelector } from '@/features/connections';
import { secretManagersHooks } from '@/features/secret-managers';
import { api } from '@/lib/api';

import { secretManagersUtils } from './util';

const AddEditSecretManagerConnectionDialog = ({
  children,
  connection,
}: AddEditSecretManagerConnectionDialogProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>{children}</DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('Edit')}</TooltipContent>
      </Tooltip>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {connection
              ? `${t('Edit')} ${connection.name}`
              : t('New Kubernetes Secret Connection')}
          </DialogTitle>
        </DialogHeader>
        <AddEditSecretManagerForm
          key={open ? 'open' : 'closed'}
          connection={connection}
          setOpen={setOpen}
        />
      </DialogContent>
    </Dialog>
  );
};

export default AddEditSecretManagerConnectionDialog;

const AddEditSecretManagerForm = ({
  connection,
  setOpen,
}: {
  connection?: RefresquitoSecretManagerConnectionWithStatus;
  setOpen: (open: boolean) => void;
}) => {
  const isEdit = !!connection;

  const form = useForm<UpsertRefresquitoSecretManagerConnectionRequest>({
    resolver: zodResolver(UpsertRefresquitoSecretManagerConnectionRequest),
    mode: 'onChange',
    defaultValues: secretManagersUtils.getDefaultValues(connection),
  });

  const watchedScope = form.watch('scope');

  const { mutate: createConnection, isPending: isCreating } =
    secretManagersHooks.useCreateSecretManagerConnection({
      onSuccess: () => setOpen(false),
      onError: (error) => handleMutationError(error, form),
    });

  const { mutate: updateConnection, isPending: isUpdating } =
    secretManagersHooks.useUpdateSecretManagerConnection({
      onSuccess: () => setOpen(false),
      onError: (error) => handleMutationError(error, form),
    });

  const isPending = isCreating || isUpdating;

  const handleSubmit = (
    values: UpsertRefresquitoSecretManagerConnectionRequest,
  ) => {
    form.clearErrors('root.serverError');
    if (isEdit && connection) {
      updateConnection({ id: connection.id, config: values });
    } else {
      createConnection(values);
    }
  };

  return (
    <Form {...form}>
      <form
        className="grid space-y-4"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <div className="grid space-y-3">
          <FormField
            name="name"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <Label htmlFor="connection-name" showRequiredIndicator>
                  {t('Name')}
                </Label>
                <Input
                  {...field}
                  id="connection-name"
                  placeholder={t('e.g. Refresquito Kubernetes Secrets')}
                  className="rounded-sm"
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            name="namespace"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <Label htmlFor="connection-namespace" showRequiredIndicator>
                  {t('Namespace')}
                </Label>
                <Input
                  {...field}
                  id="connection-namespace"
                  placeholder="refresquito-secrets"
                  className="rounded-sm"
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            name="secretName"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <Label htmlFor="connection-secret-name" showRequiredIndicator>
                  {t('Secret Name')}
                </Label>
                <Input
                  {...field}
                  id="connection-secret-name"
                  placeholder="activepieces-flow-secrets"
                  className="rounded-sm"
                />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            name="scope"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <Label htmlFor="connection-scope" showRequiredIndicator>
                  {t('Scope')}
                </Label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="connection-scope">
                    <SelectValue placeholder={t('Select scope')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={RefresquitoSecretManagerScope.PLATFORM}>
                      {t('Platform')}
                    </SelectItem>
                    <SelectItem value={RefresquitoSecretManagerScope.PROJECT}>
                      {t('Project')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {watchedScope === RefresquitoSecretManagerScope.PROJECT && (
            <ProjectSelector control={form.control} name="projectIds" />
          )}
        </div>
        {form.formState.errors.root?.serverError && (
          <FormMessage>
            {form.formState.errors.root.serverError.message}
          </FormMessage>
        )}

        <DialogFooter className="mt-1">
          <Button
            variant="outline"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setOpen(false);
            }}
          >
            {t('Cancel')}
          </Button>
          <Button loading={isPending} type="submit">
            {t('Save')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleMutationError(
  error: Error,
  form: ReturnType<typeof useForm<any>>,
): void {
  if (api.isError(error)) {
    const apError = error.response?.data as ApErrorParams;
    if (apError?.code === ErrorCode.SECRET_MANAGER_CONNECTION_FAILED) {
      form.setError('root.serverError', {
        type: 'manual',
        message: t('Failed to connect to secret manager with error: "{msg}"', {
          msg: apError.params?.message,
        }),
      });
    }
  } else {
    form.setError('root.serverError', {
      type: 'manual',
      message: t('Failed to connect to secret manager, please check console'),
    });
  }
}

type AddEditSecretManagerConnectionDialogProps = {
  connection?: RefresquitoSecretManagerConnectionWithStatus;
  children: React.ReactNode;
};
