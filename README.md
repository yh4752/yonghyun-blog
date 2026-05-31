# yonghyun-blog
Personal tech blog and portfolio

## Development

```bash
npm run dev
npm run validate:posts -- --source --project yonghyun-blog
npm run sync:posts
npm run validate:posts
npm run build
```

Set `PUBLIC_SITE_URL` for canonical URLs when you know the deployed domain:

```bash
PUBLIC_SITE_URL=<actual production URL> npm run build
```

## Planning

- [Portfolio Blog Strategy](docs/portfolio-blog-strategy.md)
- [Design Guidelines](docs/design-guidelines.md)
- [Content Publishing Workflow](docs/content-publishing-workflow.md)
- [Implementation Blueprint](docs/implementation-blueprint.md)
