import { can } from '@tatagereja/shared';
import { Clock, Globe, Mail, MapPin, Phone, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useChurch } from '@/components/layout/church-provider';
import { EntityAvatar } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/misc';
import { ChurchForm } from '@/features/churches/church-form';
import { useI18n } from '@/lib/i18n';
import { useUpdateChurchProfile } from '../api';
import { SettingsPage } from './layout';

function ReadOnlyProfile() {
  const { t } = useI18n();
  const { church } = useChurch();
  const rows = [
    { icon: MapPin, value: [church.address, church.city].filter(Boolean).join(', ') },
    { icon: Phone, value: church.phone },
    { icon: Mail, value: church.email },
    { icon: Globe, value: church.website, href: church.website },
    { icon: Wallet, value: `${t('admin-security.currency')}: ${church.currency}` },
    { icon: Clock, value: `${t('admin-security.timeZone')}: ${church.timezone}` },
  ].filter((row) => !!row.value);
  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <EntityAvatar
            name={church.name}
            src={church.logoUrl}
            color={church.brandColor}
            size="xl"
            square
          />
          <div className="min-w-0">
            <p className="text-lg font-bold tracking-tight">{church.name}</p>
            <p className="text-sm text-pretty text-muted-foreground">
              {church.description ?? t('admin-security.noDetails')}
            </p>
          </div>
        </div>
        <ul className="flex flex-col gap-3 text-sm">
          {rows.map((row) => (
            <li key={String(row.value)} className="flex items-center gap-3">
              <row.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {row.href ? (
                <a
                  href={row.href}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-primary underline-offset-4 hover:underline"
                >
                  {row.value}
                </a>
              ) : (
                <span className="min-w-0 break-words">{row.value}</span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function ChurchProfileSettingsPage() {
  const { t } = useI18n();
  const { church, churchId, access } = useChurch();
  const update = useUpdateChurchProfile(churchId);
  const editable = can.editChurch(access);
  return (
    <SettingsPage section="profile" description={church.name}>
      {editable ? (
        <Card>
          <CardContent>
            <ChurchForm
              church={church}
              submitLabel={t('common.saveChanges')}
              onSubmit={async (values) => {
                await update.mutateAsync(values);
                toast.success(t('admin-security.profileSaved'));
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Alert variant="info">{t('admin-security.profileReadOnly')}</Alert>
          <ReadOnlyProfile />
        </>
      )}
    </SettingsPage>
  );
}
