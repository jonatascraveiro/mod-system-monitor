# sessoes-ativas

Mod do Claude Code com um **painel das sessões ativas nesta máquina**: projeto, branch, card Jira, há quanto tempo está aberta, título e último prompt de cada uma.

## O que faz

- Abre o painel **Sessões ativas** com o comando `/sessoes`, atualizado a cada 10 segundos.
- Para cada sessão: nome, status, projeto, branch atual, card Jira (detectado no título/prompt) e idade.
- **Enviar mensagem**: escreve no campo da sessão e tecla Enter para mandar o texto a ela.
- **Ver conversa**: mostra as últimas mensagens da sessão.
- **Encerrar**: aparece só em sessões paradas que não são a atual; pede confirmação e confere se o pid ainda é do mesmo processo antes de enviar `SIGTERM`.

## Requisitos

- Claude Code com suporte a mods (hooks module com `ui.render` e painéis).
- Linux (usa `/proc`, `git`, `grep`, `tail` e `kill`).

## Como ativar

No prompt de uma sessão do Claude Code:

```
/plugin install sessoes-ativas --marketplace jonatascraveiro/mod-system-monitor
```

Responda `y` para adicionar o marketplace e escolha o escopo (`user` vale para todas as sessões).

Pelo shell:

```
claude plugin install sessoes-ativas --marketplace jonatascraveiro/mod-system-monitor
```

### Rodar direto da pasta

```
git clone https://github.com/jonatascraveiro/mod-system-monitor.git
claude --plugin-dir ./mod-system-monitor/mods/sessoes-ativas
```

## Desativar

```
/plugin disable sessoes-ativas
```

## Desenvolvimento

Na pasta `mods/sessoes-ativas`:

```
claude plugin validate .
claude plugin test .
```
