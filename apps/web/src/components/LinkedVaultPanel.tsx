import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { VaultStatus } from "@hub/contracts";
import { z } from "zod";
import { apiJson } from "../api.ts";
import { Button } from "./ui.tsx";

/** Settings → linked vault state (D-062). Hidden when HUB_LINKED_VAULT is not set. */
export function LinkedVaultPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["vault-status"], queryFn: () => apiJson("/api/vault/status", VaultStatus) });
  const rebind = useMutation({
    mutationFn: () => apiJson("/api/vault/linked/rebind", z.null(), { method: "POST" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["vault-status"] }); void qc.invalidateQueries({ queryKey: ["notes"] }); },
  });
  const linked = status.data?.linked;
  if (!linked) return null;
  const needsConfirm = linked.state === "replaced" || linked.state === "empty_unconfirmed";
  return (
    <section aria-labelledby="linked-vault-title" className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface p-8">
      <h2 id="linked-vault-title" className="text-[20px] font-medium">{t("linkedVault.title")}</h2>
      <p className="mt-1 max-w-prose text-[14px] text-muted">{t("linkedVault.intro")}</p>
      <p role="status" className="mt-4 text-[14px]">{t(`linkedVault.state.${linked.state}`)} {t("linkedVault.notes", { count: linked.notes })}</p>
      {needsConfirm ? (
        <div className="mt-4">
          <Button onClick={() => rebind.mutate()} disabled={rebind.isPending}>{t("linkedVault.rebind")}</Button>
          <p className="mt-2 max-w-prose text-[13px] text-muted">{t("linkedVault.rebindHelp")}</p>
        </div>
      ) : null}
    </section>
  );
}
