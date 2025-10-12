# システム仕様更新 (稼働カレンダー)

## 変更概要
- `/dashboard` で表示する社内向けダッシュボードを稼働状況カレンダーに一本化しました。
- Airtable の Logs テーブルを参照し、日別の打刻サマリおよび日次明細を取得します。
- 旧「案件進捗」関連の API・UI は廃止し、カレンダーのみを提供します。

## データモデル
- Logs テーブルの主要フィールド: `user`, `site`, `type (IN|OUT)`, `timestamp`, `workType`, `note`, `siteName`。
- API レイヤーでは Asia/Tokyo (JST) で集計し、1 日あたりのユニーク現場名リストと IN/OUT ペアを算出します。

## API 仕様

### GET `/api/calendar/month`
- 認証必須。
- クエリ: `year=YYYY`, `month=MM`。
- レスポンス: `{ year, month, days: [{ date: 'YYYY-MM-DD', sites: string[], punches: number, sessions: number, hours: number }] }`。
- `hours` はユーザー単位で IN → OUT をペアリングし、差分時間を合算 (小数第 2 位で丸め) します。

### GET `/api/calendar/day`
- 認証必須。
- クエリ: `date=YYYY-MM-DD`。
- レスポンス: `{ date, punches: [{ timestamp, type, userName, siteName, workType, note }], sessions: [{ userName, siteName, clockInAt, clockOutAt, hours }] }`。
- 日次明細も JST で整形し、未マッチの IN / OUT は警告ログを残してスキップします。

## 画面仕様
- `/dashboard` は月次カレンダーを表示し、各セルで稼働時間・打刻件数・現場名の要約を確認できます。
- 日セルをクリックするとドロワーが開き、ユーザー別セッションと打刻明細を閲覧できます。

## 自動セッション生成フロー
- `/api/stamp` で OUT 打刻が登録されると、ワーカー enqueue と並列で `/api/out-to-session` への非同期 POST を実行します。
- `/api/out-to-session` は Sessions テーブルに upsert したのち、同日の ReportIndex テーブルへ `date`・`year`・`month` のみを upsert します。
- テーブル名は `AIRTABLE_TABLE_SESSIONS` / `AIRTABLE_TABLE_REPORT_INDEX` で環境ごとに調整可能です。未設定時は `Sessions` / `ReportIndex` を使用します。
