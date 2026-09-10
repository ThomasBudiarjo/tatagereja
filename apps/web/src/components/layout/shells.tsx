import {
  CalendarDays,
  Church,
  Home,
  LogOut,
  Megaphone,
  Menu,
  Settings,
  UserCircle,
  Users,
  UsersRound,
  ClipboardCheck,
  Repeat,
} from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { EntityAvatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLogout } from '@/features/auth/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { useChurch } from './church-provider';

function UserMenu() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const logout = useLogout();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          aria-label="Account menu"
        >
          <EntityAvatar name={user.name} src={user.avatarUrl} size="sm" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="truncate">{user.name}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => navigate('/profile')}>
          <UserCircle /> Account
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/churches')}>
          <Repeat /> Switch church
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => logout.mutate()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Shell for pages outside a church (church list, account). */
export function AccountShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur safe-top">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Church className="size-4" />
            </span>
            TataGereja
          </NavLink>
          <UserMenu />
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

const navItems = [
  { to: '', label: 'Home', icon: Home, end: true },
  { to: '/people', label: 'People', icon: Users, end: false },
  { to: '/events', label: 'Events', icon: CalendarDays, end: false },
  { to: '/groups', label: 'Groups', icon: UsersRound, end: false },
  { to: '/more', label: 'More', icon: Menu, end: false },
] as const;

const sidebarExtra = [
  { to: '/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/attendance', label: 'Attendance', icon: ClipboardCheck },
  { to: '/settings', label: 'Church settings', icon: Settings },
] as const;

/** Shell for pages inside a church: top bar, desktop sidebar and mobile bottom tabs. */
export function AppShell() {
  const { church, base, access } = useChurch();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'bg-accent text-accent-foreground'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    );
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card/60 md:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <EntityAvatar name={church.name} src={church.logoUrl} color={church.brandColor} square />
          <div className="min-w-0">
            <p className="truncate font-bold tracking-tight">{church.name}</p>
            <p className="truncate text-xs text-muted-foreground capitalize">{access.role}</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {navItems
            .filter((item) => item.to !== '/more')
            .map((item) => (
              <NavLink key={item.to} to={`${base}${item.to}`} end={item.end} className={linkClass}>
                <item.icon className="size-4" /> {item.label}
              </NavLink>
            ))}
          <div className="my-2 border-t" />
          {sidebarExtra.map((item) => (
            <NavLink key={item.to} to={`${base}${item.to}`} className={linkClass}>
              <item.icon className="size-4" /> {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center justify-between border-t px-4 py-3">
          <Button asChild variant="ghost" size="sm">
            <NavLink to="/churches">
              <Repeat /> Switch
            </NavLink>
          </Button>
          <UserMenu />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur safe-top md:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <NavLink to={base} className="flex min-w-0 items-center gap-2.5">
              <EntityAvatar
                name={church.name}
                src={church.logoUrl}
                color={church.brandColor}
                size="sm"
                square
              />
              <span className="truncate font-bold tracking-tight">{church.name}</span>
            </NavLink>
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 pb-20 md:pb-0">
          <Outlet />
        </main>
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur safe-bottom md:hidden"
          aria-label="Primary"
        >
          <div className="grid h-16 grid-cols-5">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={`${base}${item.to}`}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                        isActive && 'bg-accent',
                      )}
                    >
                      <item.icon className="size-5" />
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
