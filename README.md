# Obsidian Remember The Milk Sync (Cow Edition 🐮) v1.2.0

This is a powerful plugin for [Obsidian](https://obsidian.md) that syncs tasks with [Remember The Milk](https://www.rememberthemilk.com/) (RTM).

It is designed to be **fully compatible with the [Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin** and offers granular control over which tasks to import.

## New in v1.2.0 🚀

* **Select & Import**: A popup modal allows you to select exactly which tasks to import from your RTM lists.
* **Custom Filters**: Import tasks using RTM's powerful search syntax (e.g., `list:Work AND due:today`).
* **Metadata Sync**: RTM List names and Tags are automatically converted to Obsidian hashtags (e.g., `#Inbox`, `#Work`).
* **Smart Add**: Adding tasks from Obsidian supports RTM's Smart Add syntax (e.g., adding `#tag` in Obsidian adds the tag in RTM).

## Features

* **Download Tasks**: Fetch tasks with full metadata (Due Dates `📅`, Priorities `🔺`, Tags).
* **Add Tasks**: Create a new task in RTM from the current line.
* **Complete Tasks**: Mark a task as completed in RTM directly from Obsidian.
* **Robust ID Linking**: Uses a stable Markdown link `[🐮](rtm:...)` at the start of the line. This ensures IDs remain visible in Source Mode but unobtrusive in Live Preview.

## Prerequisite

**You must obtain your own API Key from Remember The Milk.**

1.  Go to [RTM API Key Request page](https://www.rememberthemilk.com/services/api/keys.rtm).
2.  Apply for an API Key (Non-commercial use).
3.  Note down your **API Key** and **Shared Secret**.

## Installation

1.  Create `obsidian-rtm-sync` folder in `.obsidian/plugins/`.
2.  Place `main.js`, `manifest.json`, and `styles.css`.
3.  Reload Obsidian and enable in **Community Plugins**.

## Setup

1.  Open Obsidian **Settings** > **Remember The Milk Settings**.
2.  Enter **API Key** and **Shared Secret**.
3.  Click **"Start Auth"**, authorize in browser, then click **"Finish Auth"**.

## Usage

### 1. Download Tasks
* **Select & Import**: Run `RTM Sync: Select and import tasks`. Check tasks in the popup and import.
* **Custom Filter**: Run `RTM Sync: Download tasks (Custom Filter)`. Enter query (e.g., `list:Inbox`) and import.

**Output Example:**
`- [ ] [🐮](rtm:...) Buy Milk 🔺 📅 2026-01-01 #Inbox`

### 2. Add a Task
* Write: `- [ ] Call Mom #Family`
* Run `RTM Sync: Add cursor line to RTM`.
* Task is sent to RTM, and `[🐮]` link is appended.

### 3. Complete a Task
* Place cursor on a synced task (with `[🐮]`).
* Run `RTM Sync: Complete task at cursor`.
* Task marks complete in RTM and Obsidian (`- [x]`).

---

# 日本語 (Japanese)

Remember The Milk (RTM) のタスクを Obsidian 上で同期・管理するためのプラグインです。
**Obsidian Tasks プラグイン** との互換性を重視しており、期限や優先度を Tasks 形式で出力します。

## v1.2.0 の新機能 🚀
* **選択インポート**: タスク一覧画面（モーダル）から、必要なタスクだけを選んで取り込めます。
* **カスタム検索**: `list:仕事 due:today` のように検索条件を指定してダウンロードできます。
* **ハッシュタグ変換**: RTM のリスト名やタグを、Obsidian のハッシュタグ（`#Inbox` `#タグ`）として自動変換します。

## 主な機能
* **Obsidian Tasks 完全互換**: 期限日 (`📅`) や優先度 (`🔺`) を標準的な形式で扱います。
* **堅牢なID管理**: タスクIDを `[🐮](rtm:...)` というMarkdownリンクとして行頭に配置。ID消失を防ぎます。
* **スマート追加**: Obsidian で `- [ ] タスク #タグ` と書けば、RTM 側でもタグ付けされます。

## 設定方法
1.  **APIキー**: [RTM API Key 申請ページ](https://www.rememberthemilk.com/services/api/keys.rtm) から取得してください。
2.  **設定**: Obsidian設定画面で **API Key** と **Shared Secret** を入力し、認証してください。

## 使い方

### 1. タスクのダウンロード
* **選択インポート**: コマンド `Select and import tasks` で一覧から選択して追加。
* **条件指定**: コマンド `Download tasks (Custom Filter)` で検索条件（例: `list:Inbox`）を指定して追加。

### 2. タスクの追加
* エディタに行を作成: `- [ ] 新しいタスク #タグ`
* コマンド `Add cursor line to RTM` を実行。

### 3. タスクの完了
* 同期済みのタスク（`[🐮]` がある行）でコマンド `Complete task at cursor` を実行。

## Development

```bash
npm install
npm run build