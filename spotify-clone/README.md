# Waveform — a Spotify-shaped web player

A clean-room rebuild of the logged-out **spotify.com** web player surface: top bar,
library panel, scrolling feed, preview banner and a working transport bar. Built with
plain HTML, CSS and JavaScript — no build step, no dependencies.

```bash
python3 -m http.server 3000
# then open http://localhost:3000
```

## What works

- Five feed sections — trending songs, artists, albums, radio, charts — with horizontal
  scrolling and chevron buttons
- Play button on card hover/focus, green on the active card
- Transport: play/pause, seek (click or drag), previous/next, shuffle, repeat, like,
  volume and mute
- Search across songs, artists and albums, with a proper empty state
- Keyboard: `Space` toggles playback, `Shift + ←/→` skips, arrows seek and change
  volume when a slider has focus
- Responsive from 360px to wide desktop

## What is deliberately not here

- **Audio.** The player simulates a timeline; there are no tracks and no streaming.
- **Accounts, playlists, persistence.** The add button and promos are inert.
- **Spotify's catalogue, artwork, logo or copy.** All names, artwork and interface text
  are original to this project. Artwork is generated from gradients and monograms.
- **Podcasts, audiobooks, ads, billing.**

Trademarks and the original design belong to Spotify. This is a layout and interaction
study, not a product.

## Files

| file | role |
| --- | --- |
| `index.html` | shell, inline SVG icon sprite, player markup |
| `styles.css` | design tokens, layout, components, states, responsive rules |
| `app.js` | seed catalogue, rendering, search, player state machine |

Recon, feature matrix and build notes live one level up in `../replica/`.
