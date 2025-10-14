This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Runbook

- `NEXTAUTH_SECRET` は Preview/Production で同一値を使用し、ローテーション時は再ログインを周知する
- セッション異常時はブラウザの Cookie を削除して再ログインする
- 環境変数更新後は Vercel の対象環境へ再デプロイする

## 集計方針の簡素化
本システムは Logs テーブルのみを検索・集計対象とします。IN/OUT のペアリングはユーザー単位で行い、未マッチの OUT は
警告ログを残して破棄します。現場名・作業内容・機械名などの属性は IN 打刻を優先し、OUT 打刻で補完可能な場合のみ
上書きします。
