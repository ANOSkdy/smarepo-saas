# システム仕様更新 (ダッシュボード)

## ER 図の更新ポイント
- **Projects** テーブルを追加し、`projectId`, `name`, `status`, `startDate`, `endDate`, `progressPercent`, `spreadsheetUrl` を保持します。
- `Projects.site` は `Sites` とのリンクフィールドです。`Session` と `Projects` の直接リンクは任意ですが、`Sites` を介して代表プロジェクトを判定します。

## API 追加
### GET `/api/dashboard/projects`
- 認証必須。
- クエリ: `search`, `status`, `sort` (`progress|startDate|endDate`), `order` (`asc|desc`), `page`, `pageSize`。
- レスポンス: `{ items: [{ projectId, name, siteName, status, startDate, endDate, progressPercent, spreadsheetUrl }], total }`。

### GET `/api/dashboard/calendar`
- 認証必須。
- クエリ: `year=YYYY`, `month=MM`。
- レスポンス: `{ year, month, days: [{ date: 'YYYY-MM-DD', hours, sessions }] }` (JST 基準 / 時間は小数第 2 位で丸め)。

### GET `/api/dashboard/day-detail`
- 認証必須。
- クエリ: `date=YYYY-MM-DD`。
- レスポンス: `{ date, sessions: [{ username, sitename, workdescription, clockInAt, clockOutAt, hours, projectName? }], spreadsheetUrl }`。
- `spreadsheetUrl` は同一拠点に紐づく Projects から終了日が最新のものを代表として返却します。
