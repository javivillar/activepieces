import {
  refresquitoSecretManagerReferenceUtils,
  RefresquitoSecretManagerConnectionWithStatus,
} from '@activepieces/shared';
import { t } from 'i18next';
import { KeyRound } from 'lucide-react';
import * as React from 'react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input, InputProps } from '@/components/ui/input';
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
import { secretManagersHooks } from '@/features/secret-managers';
import { platformHooks } from '@/hooks/platform-hooks';
import { cn } from '@/lib/utils';

type SecretInputProps = Omit<InputProps, 'value' | 'onChange'> & {
  value?: string;
  onChange?: (value: string) => void;
};

type SecretManagerToggleButtonProps = {
  isActive: boolean;
  onClick: () => void;
};

const SecretManagerToggleButton = React.memo(
  ({ isActive, onClick }: SecretManagerToggleButtonProps) => {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onClick}
            className={cn('shrink-0', {
              'bg-primary/10': isActive,
            })}
          >
            <KeyRound
              className={cn('size-4', {
                'text-primary': isActive,
              })}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isActive ? t('Disable Secret Manager') : t('Use Secret Manager')}
        </TooltipContent>
      </Tooltip>
    );
  },
);

SecretManagerToggleButton.displayName = 'SecretManagerToggleButton';

const buildSecretValue = (
  connectionId: string | undefined,
  key: string,
): string => {
  if (!connectionId || !key) {
    return '';
  }
  return refresquitoSecretManagerReferenceUtils.build({ connectionId, key });
};

const SecretInput = React.forwardRef<HTMLInputElement, SecretInputProps>(
  ({ className, value, onChange, ...restProps }, ref) => {
    const { onBlur, name, disabled, ...otherProps } = restProps;

    const { platform } = platformHooks.useCurrentPlatform();
    const { data: connections } =
      secretManagersHooks.useListSecretManagerConnections({
        connectedOnly: true,
      });

    const existingReference = value
      ? refresquitoSecretManagerReferenceUtils.parse(value)
      : null;

    const [showSecretManagerInput, setShowSecretInput] = useState(
      !!existingReference,
    );
    const [selectedConnectionId, setSelectedConnectionId] = useState<
      string | undefined
    >(existingReference?.connectionId);
    const [secretKey, setSecretKey] = useState(existingReference?.key ?? '');

    const toggleSecretManager = () => {
      const newShowSecretInput = !showSecretManagerInput;
      setShowSecretInput(newShowSecretInput);

      if (newShowSecretInput) {
        onChange?.(buildSecretValue(selectedConnectionId, secretKey));
      } else {
        onChange?.('');
      }
    };

    const handleConnectionChange = (newConnectionId: string) => {
      setSelectedConnectionId(newConnectionId);
      setSecretKey('');
      onChange?.(buildSecretValue(newConnectionId, ''));
    };

    const handleKeyChange = (newKey: string) => {
      setSecretKey(newKey);
      onChange?.(buildSecretValue(selectedConnectionId, newKey));
    };

    const handleNormalInputChange = (
      e: React.ChangeEvent<HTMLInputElement>,
    ) => {
      onChange?.(e.target.value);
    };

    const selectedConnection = connections?.find(
      (connection: RefresquitoSecretManagerConnectionWithStatus) =>
        connection.id === selectedConnectionId,
    );

    if (showSecretManagerInput) {
      return (
        <div className={cn('flex flex-col gap-2', className)}>
          <div className="flex items-center gap-2">
            <SecretManagerToggleButton
              isActive={true}
              onClick={toggleSecretManager}
            />
            <Select
              value={selectedConnectionId}
              onValueChange={handleConnectionChange}
            >
              <SelectTrigger className="w-64">
                {selectedConnection ? (
                  <span className="truncate">{selectedConnection.name}</span>
                ) : (
                  <SelectValue placeholder={t('Select connection')} />
                )}
              </SelectTrigger>
              <SelectContent>
                {connections?.map((connection) => (
                  <SelectItem key={connection.id} value={connection.id}>
                    {connection.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder={t('Secret key')}
              value={secretKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              disabled={disabled || !selectedConnectionId}
              type="text"
            />
          </div>
        </div>
      );
    }

    return (
      <div className={cn('flex items-center gap-2', className)}>
        {platform.plan.secretManagersEnabled &&
          connections &&
          connections.length > 0 && (
            <SecretManagerToggleButton
              isActive={false}
              onClick={toggleSecretManager}
            />
          )}
        <Input
          ref={ref}
          name={name}
          onBlur={onBlur}
          disabled={disabled}
          className="flex-1"
          value={value || ''}
          onChange={handleNormalInputChange}
          type={otherProps.type}
        />
      </div>
    );
  },
);

SecretInput.displayName = 'SecretInput';

export { SecretInput, type SecretInputProps };
