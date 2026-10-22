# mod-system-monitor

Marketplace de mods do Claude Code.

| Mod | O que faz |
| --- | --- |
| [`sysmon-band`](mods/sysmon-band/README.md) | Faixa acima do prompt com data e hora, consumo da sessão, CPU, RAM, swap e disco |
| [`sessoes-ativas`](mods/sessoes-ativas/README.md) | Painel `/sessoes` com as sessões ativas da máquina: enviar mensagem, ver conversa e encerrar |

![Demonstração do sysmon-band](mods/sysmon-band/docs/demo.gif)

## Instalar

No prompt de uma sessão do Claude Code:

```
/plugin install sysmon-band --marketplace jonatascraveiro/mod-system-monitor
/plugin install sessoes-ativas --marketplace jonatascraveiro/mod-system-monitor
```

Responda `y` para adicionar o marketplace e escolha o escopo (`user` vale para todas as sessões).

Quem já tem o marketplace adicionado atualiza com:

```
claude plugin marketplace update mod-system-monitor
```

Se o repositório for privado, só instala quem tem acesso a ele no GitHub e uma credencial git para github.com na máquina (chave SSH, ou `gh auth login` seguido de `gh auth setup-git`).

## Estrutura

```
.claude-plugin/marketplace.json   lista os mods do repositório
mods/sysmon-band/                 faixa de monitoramento
mods/sessoes-ativas/              painel de sessões ativas
```
