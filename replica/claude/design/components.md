# Components — Alcove

Tokens come from `tokens.json`; nothing below uses raw hex in code.

## Buttons

```
Button
  variants  primary (accent fill), secondary (surface + border), ghost (no fill),
            danger (danger text, danger-soft hover), icon (square, ghost)
  sizes     sm 30px, md 36px, lg 44px; icon 32/36/40
  states    default, hover (accent-hover or surface-2), active (translateY 1px),
            focus-visible (2px focus ring, 2px offset), disabled (45% opacity,
            not-allowed), loading (spinner replaces leading icon, label kept)
  tokens    radius pill for composer actions, md everywhere else; font sm/600
  a11y      real <button>, aria-label on icon-only, aria-busy while loading
  used on   every screen
```

## Sidebar row

```
SidebarRow (chat / project / nav item)
  layout    8px padding, radius md, 32px height, truncating label, trailing menu
  states    default, hover (surface), active (accent-soft + text), focus-visible,
            renaming (inline input), deleted (row removed, focus to next row)
  a11y      <a href> for navigation, menu button 24px target, aria-current="page"
  used on   S03, S04
```

## Composer

```
Composer
  layout    max 740px, surface, 1px border, radius xl, shadow sm; textarea grows
            from one line to 200px; action row 32px buttons under it
  parts     + menu (attach, project knowledge hint), model select, style select,
            thinking toggle, send/stop, hint line ("Enter to send")
  states    empty (send disabled), typing, streaming (send becomes stop), focused
            (border accent), dragging a file (accent-soft wash), error chip,
            attachment chips removable
  a11y      labelled textarea, Enter sends, Shift+Enter newline, buttons labelled
  used on   S01, S02, S08
```

## Message

```
Message
  user      right-aligned bubble, max 80%, bubble/bubble-ink, radius lg, 14px pad
  assistant full width, mark, 15px/24 body, max 720px
  states    pending (three dots), streaming (blinking caret), complete, stopped,
            error (banner + Retry), feedback selected
  actions   copy, retry, thumbs up/down, more; visible on hover and focus-within,
            always visible on touch
  a11y      role="log" on the list, aria-live="polite", each message labelled
  used on   S02, S08, S11
```

## Artifact card / panel

```
ArtifactCard    inline in a reply: icon, title, kind, "View" button
ArtifactPanel   right dock 44% (max 720px), full sheet under 900px
  parts         header (title, version select, preview/code tabs, copy, download,
                close), body (iframe sandbox="allow-scripts" | <pre><code>)
  states        no versions, loading, preview error, code copied, mobile sheet
  a11y          dialog role on mobile, Escape closes, focus returns to the card
  used on   S02, S09
```

## Dialogs and sheets

```
Dialog
  base      native <dialog>, scrim, surface, radius lg, shadow lg, max 520px
  settings  760px, left tab rail 168px, content scrolls
  mobile    under 560px: bottom sheet, radius lg top corners, drag handle
  a11y      focus trapped by the browser, Escape closes, focus returns
  used on   S10, S12–S19
```

## Project card / knowledge row

```
ProjectCard    name, description, chat count, star; hover raises shadow
KnowledgeRow   file icon, name, size, remove; empty state explains what to add
StyleCard      name, description, preset tag, edit/delete; selected shows check
```

## Controls

```
Switch       40x22 track, 18px thumb, accent when on, focus ring, <button role="switch">
Radio group  segmented track (surface-2), selected segment surface + shadow sm
Field        label above, 36px input, border-strong focus, error text + aria-invalid
Toast/status bottom centre, 2.4s, role="status", never the only error channel
Skeleton     3 lines, 40% shimmer, used for history and project loading
```

## States the build ships

Empty (no chats, no projects, no search results, no knowledge), loading (history
skeletons, streaming dots), error (reply error with retry, save failure toast,
revoked share page), permission (signed out CTA everywhere a session is needed),
long content (60-character project name, 8k message), mobile (drawer, sheets,
single-column projects), dark (all of the above).
