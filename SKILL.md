---
name: sigmc-design
description: Use this skill to generate well-branded interfaces and assets for SIGMC / Valdishopper, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick Reference — Valdishopper Brand

### Typography (confirmed: BrandKit PDF marzo 2026)
- **Títulos / Headings:** `Montserrat` 700–800
- **Cuerpo / UI text:** `Poppins` 300–400
- ⚠️ Do NOT use "League Spartan" — this was an error in an earlier skill version.

### Colors
```css
--vs-pink:   #D64294;  /* Primary — buttons, accents */
--vs-navy:   #0B1C49;  /* Secondary — dark navbar, text */
--vs-white:  #FFFFFF;
/* Extended */
--vs-pink-dark:   #A02D6E;
--vs-pink-subtle: #FBF0F7;
--vs-navy-subtle: #EEF1F8;
--vs-success: #1B8A5A;
--vs-warning: #D98A00;
--vs-danger:  #C0392B;
```

### Key patterns
- Navbar: dark navy background (`#0B1C49`) with white text and pink active state
- Buttons: pill-shaped (`border-radius: 999px`), pink fill or transparent ghost
- Cards: white bg, `border-radius: 14px`, 3px top accent line in section color
- Toasts: navy background + colored `border-left` (success/danger/warning)
- Icons: Lucide Icons CDN — stroke `1.5px`, navy on light, pink/white on dark
- No gradients in functional UI (marketing materials only)
- No `#E31E24` red — obsolete color, do not use
