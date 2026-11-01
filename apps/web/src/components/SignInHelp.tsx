import { useTranslation } from "react-i18next";

export function SignInHelp({ errorKey }: { errorKey?: string }) {
  const { t } = useTranslation();
  return (
    <main id="main" className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-16">
      <img src="/brand/seahorse-red.svg" alt="" className="mb-8 h-14 w-auto self-start" />
      <h1 className="text-[32px] font-medium tracking-tight">{t("auth.title")}</h1>
      {errorKey ? <p className="mt-4 text-fg" role="alert">{t(errorKey)}</p> : null}
      <p className="mt-4 text-muted">{t("auth.body")}</p>
      <div className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface p-6">
        <p className="text-[13px] text-muted">{t("auth.native")}</p>
        <pre className="mt-2 overflow-x-auto font-mono text-[13px]">pnpm --filter @hub/server token</pre>
        <p className="mt-5 text-[13px] text-muted">{t("auth.docker")}</p>
        <pre className="mt-2 overflow-x-auto font-mono text-[13px]">docker compose exec hub node apps/server/src/cli.ts token</pre>
      </div>
    </main>
  );
}
