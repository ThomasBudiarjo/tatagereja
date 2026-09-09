import {
  PERSON_MEMBERSHIP_STATUSES,
  PERSON_MEMBERSHIP_STATUS_LABELS,
  can,
  fullName,
  type PersonMembershipStatus,
} from '@tatagereja/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useChurch } from '@/components/layout/church-provider';
import { Page, PageHeader } from '@/components/layout/page';
import { EntityAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/list';
import { EmptyState, ErrorState, SearchInput, Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { getErrorMessage } from '@/lib/api';
import { ageFromBirthDate } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounced';
import { peopleListQuery } from './api';

const statusVariant = (status: PersonMembershipStatus) =>
  status === 'member' ? 'success' : status === 'inactive' ? 'muted' : 'secondary';

export function PeoplePage() {
  const { churchId, base, access } = useChurch();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const status = (params.get('status') ?? '') as PersonMembershipStatus | '';
  const page = Number(params.get('page') ?? '1');
  const debounced = useDebounced(search);

  const query = useQuery({
    ...peopleListQuery(churchId, {
      q: debounced || undefined,
      status: status || undefined,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      limit: 50,
    }),
    placeholderData: keepPreviousData,
  });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const canAdd = can.createPerson(access);
  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.total / query.data.limit)) : 1;

  return (
    <Page>
      <PageHeader
        title="People"
        description={
          query.data
            ? `${query.data.total} ${query.data.total === 1 ? 'person' : 'people'} in the directory`
            : 'Church directory'
        }
        actions={
          canAdd ? (
            <Button asChild size="sm">
              <Link to={`${base}/people/new`}>
                <Plus /> Add
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setParam('q', value);
          }}
          placeholder="Search by name, email or phone"
          className="flex-1"
        />
        <Select
          value={status}
          onChange={(event) => setParam('status', event.target.value)}
          className="sm:w-52"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {PERSON_MEMBERSHIP_STATUSES.map((value) => (
            <option key={value} value={value}>
              {PERSON_MEMBERSHIP_STATUS_LABELS[value]}
            </option>
          ))}
        </Select>
      </div>

      {query.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={debounced || status ? 'No matching people' : 'The directory is empty'}
          description={
            debounced || status
              ? 'Try a different search or filter.'
              : 'Add the people in your church to build the directory.'
          }
          action={
            canAdd && !debounced && !status ? (
              <Button asChild>
                <Link to={`${base}/people/new`}>
                  <UserPlus /> Add the first person
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <ListGroup>
            {query.data.items.map((person) => {
              const age = ageFromBirthDate(person.birthDate);
              return (
                <ListRow
                  key={person.id}
                  to={`${base}/people/${person.id}`}
                  leading={<EntityAvatar name={fullName(person)} src={person.photoUrl} />}
                  title={fullName(person)}
                  subtitle={
                    [person.phone, person.email, age !== null ? `${age} yrs` : null]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                  trailing={
                    <Badge variant={statusVariant(person.membershipStatus)}>
                      {PERSON_MEMBERSHIP_STATUS_LABELS[person.membershipStatus]}
                    </Badge>
                  }
                />
              );
            })}
          </ListGroup>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={query.data.page <= 1}
                onClick={() => setParam('page', String(query.data.page - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground tabular">
                Page {query.data.page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={query.data.page >= totalPages}
                onClick={() => setParam('page', String(query.data.page + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Page>
  );
}
