## Plano: Rebranding — Nome e Cor

### Objetivo
Trocar o nome do projeto para **Stúdio** e a cor principal para **tonalidades de azul**.

---

### 1. Nome — "Social Estúdio" / "Aprova" → "Stúdio"

Substituir em todos os pontos de contato:

| Arquivo | Ocorrência | Novo texto |
|---|---|---|
| `src/routes/__root.tsx` | Title, description, OG, Twitter meta | Stúdio |
| `src/routes/auth.tsx` | Page title, logo heading, subtitle | Stúdio |
| `src/components/app-shell.tsx` | Sidebar logo text, subtitle | Stúdio |
| `src/routes/_authenticated/dashboard.tsx` | Page title suffix | Stúdio |
| `src/routes/_authenticated/settings.tsx` | Page title suffix | Stúdio |
| `src/routes/_authenticated/content.tsx` | Page title suffix (se houver) | Stúdio |
| `src/routes/_authenticated/clients.tsx` | Page title suffix (se houver) | Stúdio |
| `src/routes/_authenticated/finance.tsx` | Page title suffix | Stúdio |
| `src/routes/_authenticated/tasks.tsx` | Page title suffix | Stúdio |
| `src/routes/portal.$token.tsx` | Page title suffix | Stúdio |
| `src/routes/invite.$token.tsx` | Page title suffix | Stúdio |

### 2. Cor Principal — Roxo (hue 290) → Azul (hue ~250)

Atualizar `src/styles.css`:
- Ajustar o hue de **290** para **~250** em todas as variáveis de cor primária.
- Afeta: `--primary`, `--ring`, `--chart-1`, `--sidebar-primary` e suas variantes no tema `.dark`.
- Manter a mesma luminosidade e croma para não quebrar contraste.

### 3. Verificação
- Conferir preview para garantir que o azul está aplicado corretamente em light e dark mode.
- Conferir que nenhuma ocorrência de "Aprova" ou "Social Estúdio" permaneceu no código-fonte.

---

**Nota técnica:** A cor atual usa OKLCH. O azul será atingido movendo o hue de 290 para ~250 (ex: `oklch(0.55 0.22 250)`), preservando luminosidade e saturação para manter consistência visual.
