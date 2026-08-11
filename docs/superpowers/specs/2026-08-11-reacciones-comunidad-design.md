# Reacciones (emoji) en posts y comentarios de la comunidad — Diseño

Fecha: 2026-08-11
Estado: Aprobado (brainstorming)

## Objetivo

Agregar reacciones tipo emoji (estilo LinkedIn) a posts y comentarios de la
comunidad. El backend ya está implementado y deployado; este trabajo es sólo
frontend. La UI tiene un **único botón** de reaccionar más un **resumen** que
muestra sólo los emojis con `count > 0` agrupados y el **total**.

## Contrato de API (ya existe en el backend)

Autenticación: JWT Bearer (igual que el resto de la comunidad).

### Enum de reacciones

`LIKE, LOVE, LAUGH, WOW, SAD, DISLIKE`

| Type    | Emoji | Label ES        |
|---------|-------|-----------------|
| LIKE    | 👍    | Me gusta        |
| LOVE    | ❤️    | Me encanta      |
| LAUGH   | 😂    | Me divierte     |
| WOW     | 😮    | Me asombra      |
| SAD     | 😢    | Me entristece   |
| DISLIKE | 👎    | No me gusta     |

### Endpoints de escritura

- `PUT /community/reactions/:targetType/:targetId` — body `{ "type": "LIKE" }`.
  Fija o **reemplaza** mi reacción (una sola por usuario por contenido).
- `DELETE /community/reactions/:targetType/:targetId` — quita mi reacción.

Ambos devuelven el estado actualizado:

```json
{
  "reactions": { "LIKE": 12, "LOVE": 3, "LAUGH": 0, "WOW": 0, "SAD": 0, "DISLIKE": 0 },
  "myReaction": "LIKE"
}
```

`:targetType` ∈ `community_post`, `community_channel_post`, `community_comment`,
`community_channel_comment` (minúscula con guión bajo). `:targetId` es el `id`
del post o comentario.

### Toggle (una sola reacción por usuario) — se resuelve en el front

- Toca una reacción distinta a `myReaction` → `PUT` con el nuevo type (reemplaza).
- Toca la **misma** que `myReaction` → `DELETE` (la saca).
- No tenía ninguna y toca una → `PUT`.

El backend **no** auto-togglea en el `PUT`; el front decide entre `PUT` y `DELETE`.

### Lecturas: reacciones embebidas

Cada post/comentario ya trae `reactions` (todas las claves del enum, 0 por
defecto) y `myReaction` (type o `null`). Mapeo de `targetType` según origen:

| Vista / endpoint                              | targetType                   |
|-----------------------------------------------|------------------------------|
| Feed item `type === "community"`              | `community_post`             |
| Feed item `type === "channel"`                | `community_channel_post`     |
| Posts de canal (`/channels/:id/posts`)        | `community_channel_post`     |
| Post comunidad (`/community/posts/:id`)       | `community_post`             |
| Comentarios de post comunidad                 | `community_comment`          |
| Comentarios de post de canal                  | `community_channel_comment`  |

### Errores (mensajes ES del back, mostrarlos al usuario)

- 400 → "Tipo de contenido no válido." / "Reacción no válida."
- 401 sin sesión → `logout()` → redirige a `/login`.
- 403 → sin acceso al canal/grupo.
- 404 → "No se encontró el contenido."

No se agrega "quién reaccionó" (no está en esta versión del backend). No se
inventan campos fuera del contrato.

## Decisiones de UX (confirmadas)

- **Apertura del selector**: click en el botón abre un popover con los 6 emojis.
  No hay reacción por defecto en el click.
- **Botón con reacción propia**: se transforma para mostrar `emoji + label`
  resaltado en `text-primary`. Dentro del popover, tocar la misma reacción la
  saca (DELETE); tocar otra la reemplaza (PUT).
- **Alcance**: sólo vistas de comunidad del usuario (no admin).

## Arquitectura

Se respeta el patrón del proyecto: Astro + `<script>` vanilla-TS que renderiza
HTML como string y usa **delegación de eventos** con guardas `dataset.bound`.
Sin React. Cliente HTTP: singleton `api` (`ApiClient`) con header
`Authorization: Bearer <token>` (ya seteado globalmente por `comunidad.astro`).

### Módulos nuevos

**`src/services/reactionsService.ts`** — red + contrato de datos:

- Tipos: `ReactionType`, `ReactionTargetType`, `ReactionCounts`
  (`Record<ReactionType, number>`), `ReactionState`
  (`{ reactions: ReactionCounts; myReaction: ReactionType | null }`).
- `REACTION_ORDER: ReactionType[]` (orden fijo de render).
- `REACTION_META: Record<ReactionType, { emoji: string; label: string }>`.
- `emptyReactionCounts()` y `normalizeReactionState(raw)`: completan claves
  faltantes con 0 y validan `myReaction`.
- `resolveToggle(current, clicked)`: función **pura** →
  `{ method: 'PUT' | 'DELETE', type?: ReactionType }`.
  - `clicked === current` → `{ method: 'DELETE' }`.
  - else → `{ method: 'PUT', type: clicked }`.
- `setReaction(targetType, targetId, type): Promise<ReactionState>` → `PUT`.
- `removeReaction(targetType, targetId): Promise<ReactionState>` → `DELETE`.
- Helpers de mapeo: `postTargetType(type)` y `commentTargetType(type)`.
- Setea el header Bearer con `getToken()` antes de las llamadas (igual que las
  funciones de canal en `communityService`).

**`src/components/comunidad/reactionBar.ts`** — UI reutilizable:

- `renderReactionBar({ targetType, targetId, reactions, myReaction, compact? }): string`
  Devuelve el HTML del bar. El estado se serializa en un atributo
  `data-rx-state` (JSON escapado) del contenedor, de modo que cada render
  arrastra su propio estado y sobrevive a los re-render de las listas.
- `initReactionBars()`: registra **una sola vez** (idempotente) los listeners
  delegados en `document` que manejan todos los bars de la página.
- Toast mínimo autocontenido (elemento transitorio abajo-centro, auto-dismiss)
  para mostrar errores. Sin dependencias nuevas.

### Cambios en módulos existentes

- `communityService.ts`: agregar `reactions?: ReactionCounts` y
  `myReaction?: ReactionType | null` a las interfaces `Post` y `Comment`
  (los valores ya vienen embebidos del back).

### Puntos de integración (4 archivos, cubren los 4 targetType)

1. `ComunidadFeed.astro` — `renderFeedPost` inserta el bar; targetType según
   `post.type` (`community_post` / `community_channel_post`).
2. `ComunidadMyPosts.astro` — `renderMyPost` inserta el bar; targetType según
   `post.type`.
3. `ComunidadPostModal.astro` — `renderCommentHtml` inserta el bar `compact`;
   targetType según `modalChannelType` (`community_comment` /
   `community_channel_comment`).
4. `dashboard/comunidad/post.astro` — `renderPostDetail` inserta el bar del post
   (según `readerType`) y `renderCommentCard` inserta el bar `compact` de cada
   comentario.

Cada archivo llama a `initReactionBars()` una vez en su `<script>`.

## Estructura visual del bar

```
[ 👍❤️😂  15 ]      [ ❤️ Me encanta ▾ ]
  resumen (count>0)     botón / trigger
```

- **Resumen** (sólo si total > 0): emojis con `count > 0` en `REACTION_ORDER`,
  agrupados/superpuestos levemente, seguidos del total. Display-only.
- **Trigger**: sin reacción → `👍 Recomendar` neutro; con reacción →
  `emoji + label` resaltado (`text-primary`). `aria-haspopup="menu"`,
  `aria-expanded`.
- **Popover**: 6 `<button aria-label="<label ES>">emoji</button>`, la reacción
  activa resaltada. Cierra con click afuera o `Escape`.

Estilos coherentes: `material-symbols-outlined`, `text-on-surface-variant`,
`bg-surface-container`, `rounded-lg`, etc.

## Flujo de interacción + actualización optimista

Al tocar un emoji en el popover:

1. `resolveToggle(myReaction, clicked)` decide `PUT`/`DELETE`.
2. **Optimista**: se calcula el nuevo `ReactionState` (−1 a la anterior si
   existía, +1 a la nueva si aplica), se reescribe `data-rx-state`, se
   re-renderiza el bar y se cierra el popover. Se guarda un *snapshot* previo.
3. Se llama a la API (`setReaction` / `removeReaction`).
4. **Reconciliación**: la respuesta del back es la fuente de verdad; se
   reescribe el estado y se re-renderiza.
5. **Error**: se restaura el snapshot, se re-renderiza y se muestra el error
   (toast). 401 → `logout()`.

Cada bar es autónomo (estado en su propio DOM), así múltiples bars y los
re-render de las listas no se pisan.

## Accesibilidad

- Trigger y opciones son `<button>` reales (Enter/Espacio nativos, tabbables).
- `aria-label` en cada opción con el label ES; `aria-haspopup`/`aria-expanded`
  en el trigger. `Escape` cierra el popover.
- Resumen marcado como decorativo (`aria-hidden` en emojis) con un texto
  accesible del total.

## Testing (Vitest)

- `reactionsService`:
  - `resolveToggle` en todos los casos (misma → DELETE, distinta → PUT, ninguna
    → PUT).
  - `normalizeReactionState` completa claves faltantes con 0 y valida
    `myReaction`.
  - `setReaction` / `removeReaction` pegan a la URL correcta con el body
    correcto (mock de `api`).
- `reactionBar`:
  - `renderReactionBar` muestra sólo emojis con `count > 0` + total, resalta
    `myReaction`, y setea los `aria-label` ES.

## Fuera de alcance

- Vistas de admin de comunidad/grupos.
- Lista de "quién reaccionó".
- Cualquier campo no presente en el contrato.
