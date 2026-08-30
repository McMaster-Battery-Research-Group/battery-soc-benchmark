import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ADMIN_NOTIFY_KINDS, type AdminNotifyPrefs } from "@/lib/admin-notify";
import { Alert } from "@/components/ui/misc";
import { NotifyToggles } from "./toggles";

export const dynamic = "force-dynamic";

/** Each administrator chooses which admin e-mails THEY receive; this never affects the other admins. */
export default async function AdminNotifications() {
  const me = await requireAdmin();
  const user = await db.user.findUnique({ where: { id: me.id }, select: { email: true, adminNotify: true } });
  const prefs = (user?.adminNotify as AdminNotifyPrefs | null) ?? {};
  const fixedList = !!process.env.ADMIN_NOTIFY_EMAIL;
  return (
    <div>
      <h1 className="font-heading text-2xl font-bold">My notifications</h1>
      <p className="mt-1 max-w-3xl text-sm text-grey-700">
        Which administrator e-mails go to <strong>{user?.email}</strong>. This only changes what you receive — other administrators keep their own settings. Results, rescore and moderation e-mails to authors are unaffected.
      </p>
      {fixedList ? (
        <Alert variant="warning" className="mt-4" title="A fixed recipient list is configured">
          The <code className="rounded bg-grey-100 px-1">ADMIN_NOTIFY_EMAIL</code> environment variable overrides per-admin preferences — these toggles are saved but have no effect until it is removed.
        </Alert>
      ) : null}
      <NotifyToggles kinds={ADMIN_NOTIFY_KINDS.map((k) => ({ ...k }))} initial={Object.fromEntries(ADMIN_NOTIFY_KINDS.map((k) => [k.key, prefs[k.key] !== false]))} />
    </div>
  );
}
