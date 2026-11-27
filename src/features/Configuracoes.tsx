"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Header from "@/components/Header";
import NavigationIcon, { type NavigationIconName } from "@/components/NavigationIcon";
import { useTheme } from "@/components/ThemeProvider";
import LogoutForm from "@/components/auth/LogoutForm";
import ClassificacaoPanel from "@/features/classificacao/ClassificacaoPanel";
import Dialog, { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Principal } from "@/lib/auth/policy";
import styles from "./Configuracoes.module.css";

type Props = Pick<Principal, "name" | "role" | "source"> & {
  email: string | null;
  lastAccess: string | null;
  mfaEnabled: boolean | null;
};

const accountIcons = {
  profile: "M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2",
  lock: "M5 10h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Zm2 0V7a5 5 0 0 1 10 0v3",
  sliders: "M3 7h10m4 0h4M3 17h4m4 0h10M17 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM11 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  monitor: "M3 3h18v13H3zM8 21h8m-4-5v5",
  info: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Zm-10 0v5m0-10v.01",
  key: "M14.5 3a6.5 6.5 0 0 0-5.9 9.2L3 18v3h4v-3h3v-3l1.8-1.6A6.5 6.5 0 1 0 14.5 3ZM16 8h.01",
  mail: "M3 5h18v14H3zM3 6l9 7 9-7",
  laptop: "M4 4h16v12H4zM4 16l-2 4h20l-2-4",
  remove: "M14 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM3 21v-2a4 4 0 0 1 4-4h5m4 0 5 5m0-5-5 5",
};
type IconName = keyof typeof accountIcons | NavigationIconName;

const tabs = [
  { key: "perfil", label: "Perfil", icon: "profile" },
  { key: "seguranca", label: "Segurança", icon: "lock" },
  { key: "preferencias", label: "Preferências", icon: "sliders" },
  { key: "notificacoes", label: "Notificações", icon: "bell" },
  { key: "sessao", label: "Sessão", icon: "monitor" },
  { key: "classificacao", label: "Classificação PCDF", icon: "layers" },
] as const;
type Tab = (typeof tabs)[number]["key"];

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  if (!(name in accountIcons)) return <NavigationIcon name={name as NavigationIconName} size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={accountIcons[name as keyof typeof accountIcons]} />
    </svg>
  );
}

function Panel({ title, description, icon, danger, children }: {
  title: string;
  description: string;
  icon: IconName;
  danger?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className={danger ? `${styles.panel} ${styles.danger}` : styles.panel}>
      <header className={styles.panelHeader}>
        <span className={styles.iconTile}><Icon name={icon} size={23} /></span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function ActionRow({ title, description, icon, children }: {
  title: string;
  description: string;
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <div className={styles.actionRow}>
      <span className={styles.iconTile}><Icon name={icon} size={21} /></span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className={styles.actions}>{children}</div>
    </div>
  );
}

function Facts({ items }: { items: readonly { label: string; icon: IconName; value: ReactNode }[] }) {
  return (
    <dl className={styles.facts}>
      {items.map(({ label, icon, value }) => (
        <div key={label} className={styles.fact}>
          <dt><Icon name={icon} size={19} />{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function Configuracoes({ name, role, source, email, lastAccess, mfaEnabled }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("seguranca");
  const [confirmLogout, setConfirmLogout] = useState(false);
  const tabButtons = useRef<Partial<Record<Tab, HTMLButtonElement>>>({});
  const { theme, setTheme } = useTheme();
  const institutional = source === "supabase";
  const preview = source === "preview";
  const nameParts = name.trim().split(/\s+/, 2);
  const initials = (nameParts.length === 1
    ? Array.from(nameParts[0]).slice(0, 2)
    : nameParts.map(word => Array.from(word)[0])).join("").toLocaleUpperCase("pt-BR");
  const emailText = email ?? "E-mail indisponível";
  const accountStatus = institutional ? "Ativa" : preview ? "Demonstração" : "Acesso local";
  const sessionStatus = preview ? "Sessão demonstrativa" : "Sessão autenticada";
  const mfaStatus = mfaEnabled === null ? "Indisponível" : mfaEnabled ? "Ativado" : "Desativado";
  const badge = (label: string, positive: boolean) => (
    <span className={positive ? `${styles.badge} ${styles.positive}` : styles.badge}>{label}</span>
  );
  const openTab = (tab: Tab) => {
    setActiveTab(tab);
    tabButtons.current[tab]?.focus();
  };

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    switch (event.key) {
      case "ArrowRight": next = (index + 1) % tabs.length; break;
      case "ArrowLeft": next = (index + tabs.length - 1) % tabs.length; break;
      case "Home": next = 0; break;
      case "End": next = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    openTab(tabs[next].key);
  }

  return (
    <>
      <Header title="Configurações" />
      <div className={styles.page}>
        <header className={styles.heading}>
          <h1>Configurações</h1>
          <p>Gerencie seu perfil, segurança, preferências da plataforma, notificações e sessões.</p>
        </header>

        <div className={styles.tabs} role="tablist" aria-label="Configurações da conta">
          {tabs.map(({ key, label, icon }, index) => (
            <button key={key} ref={node => { if (node) tabButtons.current[key] = node; }}
              type="button" role="tab" id={`settings-tab-${key}`} aria-controls={`settings-panel-${key}`}
              aria-selected={activeTab === key} tabIndex={activeTab === key ? 0 : -1}
              onClick={() => setActiveTab(key)} onKeyDown={event => handleTabKey(event, index)}>
              <Icon name={icon} size={19} />{label}
            </button>
          ))}
        </div>

        <section aria-label="Conta atual" className={styles.accountCard}>
          <div className={styles.identity}>
            <span className={styles.avatar} aria-hidden="true">{initials}</span>
            <div>
              <h2>{name}</h2>
              <p>{emailText}</p>
            </div>
          </div>
          <dl className={styles.accountDetails}>
            <div>
              <dt><Icon name="users" size={18} />Perfil</dt>
              <dd>{role}</dd>
            </div>
            <div>
              <dt><Icon name="shield" size={18} />Status da conta</dt>
              <dd>{badge(accountStatus, institutional)}</dd>
            </div>
          </dl>
        </section>

        {tabs.map(({ key }) => (
          <div key={key} role="tabpanel" id={`settings-panel-${key}`} aria-labelledby={`settings-tab-${key}`}
            hidden={activeTab !== key} tabIndex={0}>
            {activeTab === key && <>
              {key === "seguranca" && (
                <div className={styles.security}>
                  <Panel icon="lock" title="Segurança da conta" description="Gerencie o acesso e a proteção da sua conta na plataforma.">
                    <div className={styles.rows}>
                      <ActionRow icon="key" title="Alterar senha" description={institutional
                        ? "Defina uma nova senha forte para sua conta."
                        : "Alteração de senha disponível para contas institucionais."}>
                        {institutional
                          ? <Link href="/atualizar-senha" className={`${styles.button} ${styles.primary}`}>Alterar senha</Link>
                          : <button type="button" className={styles.button} disabled>Alterar senha</button>}
                      </ActionRow>
                      <ActionRow icon="shield" title="Autenticação em dois fatores (MFA)" description="A configuração de um segundo fator está indisponível nesta tela.">
                        {mfaEnabled === null
                          ? <span className={styles.switch} aria-hidden="true" data-unknown />
                          : <button type="button" role="switch" aria-label="Autenticação em dois fatores (MFA)" aria-checked={mfaEnabled} className={styles.switch} disabled />}
                        <button type="button" className={styles.button} disabled>Configurar</button>
                      </ActionRow>
                      <ActionRow icon="mail" title="Recuperação de acesso" description="A atualização do e-mail de recuperação está indisponível.">
                        <button type="button" className={styles.button} disabled>Atualizar e-mail</button>
                      </ActionRow>
                      <ActionRow icon="laptop" title="Dispositivos confiáveis" description="A lista de dispositivos confiáveis está indisponível.">
                        <button type="button" className={styles.button} disabled>Gerenciar<Icon name="chevron" size={15} /></button>
                      </ActionRow>
                      <ActionRow icon="layers" title="Sessões ativas" description="Consulte a sessão atual. O total de sessões está indisponível.">
                        <button type="button" className={styles.button} onClick={() => openTab("sessao")}>
                          Ver sessões<Icon name="chevron" size={15} />
                        </button>
                      </ActionRow>
                    </div>
                  </Panel>

                  <Panel icon="info" title="Resumo da conta" description="Informações essenciais sobre o seu acesso.">
                    <Facts items={[
                      { label: "Perfil", icon: "profile", value: role },
                      { label: "Último acesso", icon: "calendar", value: lastAccess ?? "Indisponível" },
                      { label: "Senha atualizada em", icon: "key", value: "Indisponível" },
                      { label: "MFA (dois fatores)", icon: "shield", value: badge(mfaStatus, mfaEnabled === true) },
                      { label: "Sessões abertas", icon: "monitor", value: "Total indisponível" },
                    ]} />
                  </Panel>

                  <div className={styles.risk}>
                    <Panel icon="alert" title="Zona de risco" description="Ações sensíveis que afetam o acesso à sua conta." danger>
                      <div className={styles.rows}>
                        <ActionRow icon="logout" title="Sair de todos os dispositivos" description={institutional
                          ? "Encerra também esta sessão e exige um novo login."
                          : "O encerramento em todos os dispositivos está disponível para contas institucionais."}>
                          <button type="button" className={`${styles.button} ${styles.dangerButton}`}
                            disabled={!institutional} onClick={() => setConfirmLogout(true)}>
                            <Icon name="logout" size={16} />Sair de todos os dispositivos
                          </button>
                        </ActionRow>
                        <ActionRow icon="remove" title="Solicitar desativação de conta" description="O envio de solicitações de desativação está indisponível.">
                          <button type="button" className={`${styles.button} ${styles.dangerButton}`} disabled>
                            <Icon name="remove" size={16} />Solicitar desativação
                          </button>
                        </ActionRow>
                      </div>
                    </Panel>
                  </div>
                </div>
              )}
              {key === "perfil" && (
                <Panel icon="profile" title="Dados do perfil" description="Dados vinculados à conta com a qual você entrou.">
                  <Facts items={[
                    { label: "Nome", icon: "profile", value: name },
                    { label: "E-mail", icon: "mail", value: emailText },
                    { label: "Perfil", icon: "users", value: role },
                    { label: "Status da conta", icon: "shield", value: badge(accountStatus, institutional) },
                  ]} />
                </Panel>
              )}
              {key === "preferencias" && (
                <Panel icon="sliders" title="Aparência" description="O tema selecionado é salvo neste navegador.">
                  <div className={styles.rows}>
                    <ActionRow icon="sun" title="Tema da plataforma" description="Escolha o tema claro, escuro ou siga a preferência do sistema.">
                      <select className={styles.button} aria-label="Tema da plataforma" value={theme}
                        onChange={event => {
                          const value = event.currentTarget.value;
                          if (value === "claro" || value === "escuro" || value === "sistema") setTheme(value);
                        }}>
                        <option value="claro">Claro</option>
                        <option value="escuro">Escuro</option>
                        <option value="sistema">Sistema</option>
                      </select>
                    </ActionRow>
                  </div>
                </Panel>
              )}
              {key === "notificacoes" && (
                <Panel icon="bell" title="Preferências de notificações" description="A configuração de notificações está indisponível nesta tela." />
              )}
              {key === "sessao" && (
                <Panel icon="monitor" title="Sessão atual" description="Informações sobre o acesso neste navegador.">
                  <Facts items={[
                    { label: "Sessão atual", icon: "monitor", value: badge(sessionStatus, !preview) },
                    { label: "Último acesso", icon: "calendar", value: lastAccess ?? "Indisponível" },
                    { label: "Sessões abertas", icon: "layers", value: "Total indisponível" },
                  ]} />
                </Panel>
              )}
              {key === "classificacao" && <ClassificacaoPanel />}
            </>}
          </div>
        ))}
      </div>

      {confirmLogout && (
        <Dialog className={styles.confirmDialog} onClose={() => setConfirmLogout(false)}>
          <DialogTitle asChild><h2>Sair de todos os dispositivos?</h2></DialogTitle>
          <DialogDescription>Você precisará entrar novamente no SENTINELA, inclusive neste dispositivo.</DialogDescription>
          <LogoutForm className={styles.confirmActions}>
            <button type="button" className={styles.button} onClick={() => setConfirmLogout(false)}>Cancelar</button>
            <button type="submit" className={`${styles.button} ${styles.dangerButton}`}>Confirmar saída</button>
          </LogoutForm>
        </Dialog>
      )}
    </>
  );
}
