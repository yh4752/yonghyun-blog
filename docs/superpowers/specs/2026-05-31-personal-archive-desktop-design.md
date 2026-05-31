# Personal Archive Desktop Design

Date: 2026-05-31
Status: proposed

## Goal

Improve the portfolio blog's visual identity before deployment without weakening its main purpose: helping people read technical writing and understand engineering decisions.

The selected direction is **Archive System**. The site should feel like a personal technical archive: part workspace, part filing system, part editorial blog. The home and index pages can carry more visual personality, while article pages stay quiet and readable.

## References

- [golee.me](https://www.golee.me/): personal desktop/workspace metaphor, object-based navigation, memorable first impression.
- [leerob.com](https://leerob.com/): minimal text-first writing experience.
- [KevDoy](https://kevdoy.com/): portfolio index rhythm and case-study listing structure.
- [Brittany Chiang](https://brittanychiang.com/): developer portfolio information hierarchy and sticky navigation discipline.

These references are not templates to copy. They define the feeling to borrow: personal, deliberate, restrained, and useful.

## Design Principles

1. **Home is memorable, writing is quiet.**
   The first screen can use archive objects and spatial layout. Article pages should prioritize reading.

2. **Objects must be navigation, not decoration.**
   Folders, notes, logs, and panels should link to real destinations or summarize real content.

3. **Use physical metaphors lightly.**
   The design can suggest folders, notes, and files, but it must not become a full OS parody.

4. **Keep professional trust.**
   This is still a portfolio for engineering roles. Avoid overly cute icons, heavy animation, and playful copy that weakens credibility.

5. **Mobile remains first-class.**
   Desktop can use spatial composition. Mobile should collapse into a readable archive feed.

## Scope

In scope:

- Home page redesign.
- Blog index and type-specific index redesign.
- Project index and project card redesign.
- Article header, metadata, tags, TOC, and prose polish.
- Color token refinements for archive objects.
- Responsive behavior for mobile and tablet.
- Accessibility and browser QA.

Out of scope for this pass:

- Full desktop/window manager interaction.
- Draggable folders or notes.
- Persistent dock across all pages.
- Complex animation or page transitions.
- New content model fields.
- Search UI.
- Automatic OG image generation.

## Information Architecture

The current route structure remains unchanged.

- `/`: archive-oriented home.
- `/projects`: project archive.
- `/projects/[slug]`: project case-study page.
- `/blog`: writing archive.
- `/blog/dev-log`: development log feed.
- `/blog/deep-dive`: deep-dive feed.
- `/blog/[project]/[slug]`: editorial article page.
- `/about`: resume-style profile page.

No route changes are required. The refactor is primarily presentation and component composition.

## Home Page

The home page becomes the strongest expression of the Archive System.

Desktop layout:

- Left side: short editorial introduction.
- Right side: archive board with interactive objects.
- Below first viewport: current projects and recent writing continue as scan-friendly sections.

Archive board objects:

- `Projects` folder: links to `/projects`.
- `Blog` folder: links to `/blog`.
- `About` note: links to `/about`.
- `Current: Sigak` memo: links to `/projects/sigak`.
- `Latest writing` log panel: links to the newest published post.
- `Validation log` panel: links to the latest `yonghyun-blog` deep-dive, falling back to `/projects/yonghyun-blog` if no matching post exists.

Visual treatment:

- Objects sit on a restrained paper-like surface.
- Notes can use muted yellow/cyan/green tints.
- Folders use simple CSS shapes and text labels. Do not add a new icon dependency for this pass.
- No image hero is required for this pass.
- Avoid floating blobs, neon, glass-card overuse, or decorative gradients.

Mobile layout:

- Intro appears first.
- Archive board becomes a vertical list of archive items.
- Each item has a compact icon/label, destination, and one-line description.
- No absolute positioning on mobile.

## Blog Indexes

Blog lists should feel like a logbook or file index instead of generic cards.

Post list item structure:

- Date column.
- Main content column with title and summary.
- Meta row for project, type, and tags.

Desktop:

- Use a two-column timeline/file-list layout.
- Date stays visually separate and uses mono type.
- Hover/focus can apply a subtle background and title color change.
- Avoid large boxed cards for every post.

Mobile:

- Stack date above title.
- Keep summaries visible.
- Preserve tap target size of at least 44px.

Type pages:

- `/blog/dev-log` should emphasize chronological rhythm.
- `/blog/deep-dive` should emphasize topic and decision depth.
- Both can share the same component with a small page-level intro difference.

## Project Index

Project cards should feel like folders with case-study previews.

Card structure:

- Small folder tab or file label at the top.
- Project name and one-line description.
- Status.
- Stack labels.
- Related writing count derived from existing published post data. Omit the count label only when the count is zero.

Interaction:

- Entire title area links to the project.
- Hover/focus should feel like selecting a file, not pressing a marketing card.
- Keep border radius at 6-8px.

Mobile:

- Cards stack vertically.
- Folder tab remains but does not take extra vertical space.

## Article Pages

Article pages should stay editorial and calm.

Refinements:

- Metadata line becomes more precise and compact.
- Tags become small technical labels instead of large pills.
- TOC becomes an index-card style component.
- Copy-link button can become a small icon/text utility near metadata.
- Prose headings, blockquotes, tables, and code blocks get more polished spacing.

Do not:

- Add floating dock or desktop objects to article pages.
- Use playful folder metaphors inside long-form reading pages.
- Reduce body font below 16px on mobile.
- Make the TOC block compete with the article title.

## Color And Tokens

Base palette remains restrained:

- Background: warm white or very light gray.
- Text: soft black.
- Muted text: neutral gray.
- Border: light gray.
- Accent: used for links, focus, active state, and reading progress.

Add archive object tokens:

```css
--color-note-yellow: #fef3a5;
--color-note-cyan: #c9f4f6;
--color-note-green: #dff5df;
--color-folder: #b9e5f8;
--color-paper: #ffffff;
--shadow-object: 0 14px 32px rgb(17 24 39 / 0.08);
```

Dark mode equivalents should be muted, not neon:

```css
--color-note-yellow: #4b4420;
--color-note-cyan: #1f4548;
--color-note-green: #243f2a;
--color-folder: #20445a;
--color-paper: #18181b;
--shadow-object: 0 18px 36px rgb(0 0 0 / 0.28);
```

These values can be tuned during implementation after screenshot review.

## Components

Expected component changes:

- `src/pages/index.astro`: compose new archive home layout.
- `src/components/home/ArchiveBoard.astro`: desktop archive objects and mobile list.
- `src/components/home/ArchiveItem.astro`: reusable object/list item.
- `src/components/blog/PostCard.astro`: convert from card-like item to file-list row.
- `src/components/blog/PostList.astro`: support archive-list layout.
- `src/components/project/ProjectCard.astro`: folder/case-study preview treatment.
- `src/layouts/BlogPostLayout.astro`: refine header, tags, copy link, and TOC placement.
- `src/components/blog/TableOfContents.astro`: index-card visual treatment.
- `src/styles/tokens.css`: add archive object tokens.
- `src/styles/prose.css`: polish long-form reading styles.

Component names may change if the implementation finds a better local pattern, but responsibilities should stay this clear.

## Data Flow

No new data source is required.

Use existing data:

- Published posts from `getPublishedPosts()`.
- Featured/current projects from `getFeaturedProjects()`.
- Project metadata from `src/data/projects.json`.
- Tags from existing post frontmatter.

Derived values:

- Latest writing: first item from date-sorted published posts.
- Related writing count per project: count published posts by project slug.
- Validation log target: newest published `yonghyun-blog` post with `type: "deep-dive"`.
- Archive object destinations: static route links.

## Accessibility

Requirements:

- Archive objects are semantic links or buttons only when interactive.
- Focus states must be visible.
- Object colors cannot be the only way to distinguish item type.
- Mobile archive list must be keyboard and screen-reader friendly.
- Decorative CSS shapes should not add redundant screen-reader text.
- `prefers-reduced-motion` should disable any hover movement or transitions beyond color changes.

## Responsive Rules

Breakpoints:

- Desktop: archive board can use grid and limited absolute positioning.
- Tablet: archive board becomes a two-column grid.
- Mobile: archive board becomes a single-column archive list.

Hard requirements:

- No horizontal overflow at 390px width.
- Header keeps the existing three visible nav links.
- Article titles must wrap cleanly.
- Code blocks may scroll internally, but the page must not scroll horizontally.

## Testing And Review

Run before claiming completion:

```bash
npm run validate:posts -- --source
npm test
npm run validate:posts
npm run build
git diff --check
```

Browser QA:

- Desktop screenshot: `/`, `/blog`, `/projects`, one article page.
- Mobile viewport around 390px: same routes.
- Check no horizontal overflow.
- Check main links are reachable by keyboard.
- Check light and dark modes.

## Rollout Plan

1. Implement token additions and shared object styles.
2. Redesign home archive board.
3. Redesign post list rows.
4. Redesign project cards.
5. Polish article metadata, TOC, tags, and prose.
6. Run verification and screenshot review.

Each step should be reviewed before moving to the next so visual mistakes are caught early.

## Decisions

Resolved:

- Use Archive System direction.
- Keep article pages editorial.
- Do not add full desktop/window-manager interaction.
- Do not add a persistent dock.
- Do not change routes or content schema.
- Do not add an icon dependency.
- Show related writing counts on project cards when the count is greater than zero.

Implementation tuning:

- Exact color token values may be adjusted after screenshot review, while staying within the restrained archive palette above.
