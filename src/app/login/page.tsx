"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SentinelaBrand } from "@/components/SentinelaLogo";
import Button from "@/components/ui/button";
import { useDemoToast } from "@/components/DemoProvider";

export default function Login() {
  const router = useRouter();
  const notify = useDemoToast();
  const [busy, setBusy] = useState(false);
  function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    notify("Demonstração aberta. Nenhuma autenticação foi realizada.");
    router.push("/dashboard");
  }
  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <SentinelaBrand iconSize={48} />
        <h1 id="login-title">Acesse a demonstração</h1>
        <p>Protótipo acadêmico com dados fictícios. Não informe credenciais reais.</p>
        <form onSubmit={enter}>
          <label htmlFor="demo-email">E-mail demonstrativo</label>
          <input id="demo-email" type="email" placeholder="usuario@example.com" autoComplete="off" />
          <label htmlFor="demo-password">Senha demonstrativa</label>
          <input id="demo-password" type="password" placeholder="Opcional; não será verificada" autoComplete="off" />
          <Button type="submit" disabled={busy} aria-busy={busy}>{busy ? "Abrindo…" : "Entrar na demonstração"}</Button>
        </form>
        <small>Sem sessão autenticada, banco de dados ou gravação permanente.</small>
      </section>
    </main>
  );
}
