# Overview
- /reports はユーザー名を選択しても稼働グリッドが空になる事象を再現。根本原因は、ログ取得処理が Airtable の `{user}` リンクに完全依存しており、リンクが欠落したレコードを除外してしまうためだった。ログ自体は存在しているが、リンク未設定のまま運用されているケースが多く、結果的に `FIND()` フィルタが 0 件になる。
- レポート画面はセッション集計テーブルではなく Logs テーブルを直接ペアリングしており、カレンダー API で行っている多段の Lookup 補完ロジックを再利用していない。差分の import グラフとデータソース調査結果を raw レポートとして保存済み。

# Directory
- `app/reports/page.tsx` … レポート UI（サーバーコンポーネント）。ユーザー選択とテーブル描画を担当。【F:app/reports/page.tsx†L1-L179】
- `lib/services/reports.ts` … Airtable からログを取得し `pairLogsByDay` で IN/OUT をペアリングするサービス層。【F:lib/services/reports.ts†L1-L55】
- `lib/reports/pair.ts` … ログを日別に並べ替え、IN/OUT ペアから稼働分を計算するユーティリティ。【F:lib/reports/pair.ts†L1-L134】
- `lib/airtable/logs.ts` / `app/api/calendar/day|month` … カレンダー画面が利用するログ正規化＆ Lookup 補完ロジック。【F:lib/airtable/logs.ts†L200-L360】【F:app/api/calendar/day/route.ts†L1-L156】

# Packages / Runtime
- Next.js App Router, サーバーコンポーネントで `/reports` を SSR。`pnpm tsx scripts/repo-scan/scan.ts` で import グラフを生成可能。
- Airtable SDK を直接呼び出し。Logs テーブルは REST 経由で取得し `pairLogsByDay` で加工。

# Routing / API
- `/reports` … サーバー側で `fetchUsers()`→`getReportRowsByUserName()` を連続呼び出し。クライアント側の追加 API 呼び出しは無し。
- `/api/calendar/day` / `/api/calendar/month` … 既存の稼働カレンダーが利用。ログ区間取得後に Lookup 情報を復元し、ユーザー名がリンクされていない場合でも表示されるよう配慮されている。【F:lib/airtable/logs.ts†L253-L279】【F:app/api/calendar/day/route.ts†L95-L151】

# Auth
- `/reports` は App Router のサーバーコンポーネントであり、ページ読み込み時に NextAuth セッションを自動解決（直接的な認可チェックは `app/(protected)` 配下のレイアウトで済んでいる）。API 経由の追加認証は無し。

# ENV
- Airtable 接続情報（`AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`）に依存。Logs テーブル名は既定 `Logs`。

# Airtable
- ユーザー一覧: `usersTable.select({ fields: ['name'] })` で display name を取得し、`{name}` フィールドが純粋な文字列である前提。【F:app/reports/page.tsx†L11-L22】
- ログ取得: `{name}` が一致したユーザーの `record.id` を取得し、`logsTable.select({ filterByFormula: FIND("<recordId>", ARRAYJOIN({user})) })` を実行。`{user}` Link-to-Users が空の場合は 0 件となる。【F:lib/services/reports.ts†L15-L28】
- ペアリング: `pairLogsByDay` は `{date}` フィールドを優先、欠落時に `new Date(timestamp)` の UTC 日付でグルーピング。【F:lib/reports/pair.ts†L29-L128】
- カレンダーとの差異: カレンダーは `{user}` が空でも `userId`/`username`/Lookup 文字列からユーザーを復元するため、ログが表示される。【F:lib/airtable/logs.ts†L253-L279】

# Sequence (Root Cause)
1. `/reports` で従業員名を選択すると、`getReportRowsByUserName()` が `{name}` 完全一致で Users レコードを検索し、レコード ID を取得する。【F:lib/services/reports.ts†L15-L23】
2. 同関数が Logs テーブルに対して `FIND("<recordId>", ARRAYJOIN({user}))` フィルターを発行。`{user}` Link-to-Users が空、または別の識別子で埋められているログはヒットしない。【F:lib/services/reports.ts†L22-L27】
3. ペアリング対象が 0 件になるため、テーブルは「データがありません」を表示。ログそのものは存在し、カレンダー API では確認できるが `/reports` のフィルタ条件が厳しすぎる。

**Root Cause (ranked)**
1. 🔴 主要因: `/reports` のログクエリが `{user}` リンク列に完全依存しており、リンク未設定のログを除外している。カレンダー系ロジックは複数の Lookup を併用して補完しているが `/reports` には反映されていない。【F:lib/services/reports.ts†L22-L27】【F:lib/airtable/logs.ts†L253-L279】
2. 🟡 付随要因: `pairLogsByDay` は JST 変換を行わず UTC ベースで日付キーを作成するため、`{date}` が空のレコードでは深夜帯に日付がずれる可能性がある。これは表示ズレ要因であり、完全な欠落は招かないが注意が必要。【F:lib/reports/pair.ts†L29-L58】【F:lib/airtable/logs.ts†L283-L315】

# Quality
- 自動テストは `/reports` のデータ層をカバーしていない。`pairLogsByDay` は純粋関数だが、Airtable からの取得・フィルタリングの契約が未検証。
- 原因分析の補助として以下の raw レポートを生成。
  - `reports/repo-scan/raw/reports.import-graph.txt`
  - `reports/repo-scan/raw/reports.datasource.txt`
  - `reports/repo-scan/raw/reports.vs.calendar.diff.txt`
  - `reports/repo-scan/raw/reports.airtable-assumptions.txt`
  - `reports/repo-scan/raw/reports.timezone-check.txt`

# Risks
- `{user}` リンクが空のログが今後も増えると `/reports` では永久に表示されない。
- UTC フォールバックにより、深夜打刻が別日扱いになると月次集計のフィルタが期待とずれる恐れ。

# Actions (Minimal Fix Options)
1. ✅ `/reports` をカレンダーの正規化ロジックに寄せる（推奨最小差分）
   - `getReportRowsByUserName()` を `getLogsBetween()` + `buildSessionReport()` など既存の正規化関数で置き換え、ユーザー名で後段フィルタする。
   - 影響範囲: `/reports` ページ、将来的にレポート CSV/Excel 出力にも波及。
2. ✅ Airtable フィルターの緩和
   - 現行の `FIND(recordId, ARRAYJOIN({user}))` に加え、`{userId}` テキストや `LOWER({username})` など複数キーを `OR()` で包含する。
   - 影響範囲: Airtable クエリ負荷増、該当ユーザーのログ抽出。

# Test Plan
- 既存の `tests/*.test.mjs`（カレンダー集計）を流用し、`pairLogsByDay` への回帰を確認。
- 新規: `/reports` 用に、リンク欠落ログを含むモックデータでユニットテストを追加し、補完ロジックが機能することを確認。

# Appendix
- 生データ: `reports/repo-scan/raw/*`
- インポート解析スクリプト: `scripts/repo-scan/scan.ts`
- 調査日: 2025-10-17
