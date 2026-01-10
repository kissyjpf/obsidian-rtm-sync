import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';
import { MD5 } from 'crypto-js';

// --- Configuration ---
const RTM_AUTH_URL = 'https://www.rememberthemilk.com/services/auth/';
const RTM_REST_URL = 'https://api.rememberthemilk.com/services/rest/';

interface RtmPluginSettings {
	apiKey: string;
	sharedSecret: string;
	authToken: string;
}

const DEFAULT_SETTINGS: RtmPluginSettings = {
	apiKey: '',
	sharedSecret: '',
	authToken: ''
}

// 内部で扱うタスク情報の構造
interface FormattedTask {
	name: string;
	due: string;
	priority: string;
	listName: string;
	tags: string[];
	rtmId: { list: string; series: string; task: string };
	rawPriority: string; 
	rawDue: string;      
}

export default class RtmPlugin extends Plugin {
	settings: RtmPluginSettings;
	timeline: string | null = null; 

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new RtmSettingTab(this.app, this));

		// 1. 一括ダウンロード
		this.addCommand({
			id: 'import-rtm-tasks',
			name: 'Download all incomplete tasks',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (!this.checkAuth()) return;
				await this.fetchAndInsertTasks(editor, 'status:incomplete', false); 
			}
		});

		// 2. 選択してダウンロード
		this.addCommand({
			id: 'select-rtm-tasks',
			name: 'Select and import tasks',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (!this.checkAuth()) return;
				await this.fetchAndInsertTasks(editor, 'status:incomplete', true); 
			}
		});

		// 3. フィルタ指定ダウンロード
		this.addCommand({
			id: 'import-rtm-tasks-custom',
			name: 'Download tasks (Custom Filter)',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (!this.checkAuth()) return;
				new FilterModal(this.app, async (result) => {
					await this.fetchAndInsertTasks(editor, result, true);
				}).open();
			}
		});

		this.addCommand({
			id: 'add-rtm-task',
			name: 'Add cursor line to RTM',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (!this.checkAuth()) return;
				await this.addTaskFromEditor(editor);
			}
		});

		this.addCommand({
			id: 'complete-rtm-task',
			name: 'Complete task at cursor',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (!this.checkAuth()) return;
				await this.completeTaskInEditor(editor);
			}
		});
	}

	checkAuth(): boolean {
		if (!this.settings.apiKey || !this.settings.sharedSecret) {
			new Notice('Please set your API Key and Secret in settings.');
			return false;
		}
		if (!this.settings.authToken) {
			new Notice('Please authenticate with RTM from settings.');
			return false;
		}
		return true;
	}

	// Helper: リスト名取得
	async fetchListsMap(): Promise<Record<string, string>> {
		const map: Record<string, string> = {};
		try {
			const res = await this.callRtmApi('rtm.lists.getList');
			if (res.rsp.lists && res.rsp.lists.list) {
				const lists = Array.isArray(res.rsp.lists.list) ? res.rsp.lists.list : [res.rsp.lists.list];
				for (const l of lists) {
					if (l && l.id && l.name) map[l.id] = l.name;
				}
			}
		} catch (e) { console.error("List fetch error:", e); }
		return map;
	}

	// Core Logic
	async fetchAndInsertTasks(editor: Editor, filterStr: string, showSelectionUI: boolean) {
		new Notice(`Fetching tasks...`);
		try {
			const listMap = await this.fetchListsMap();
			const response = await this.callRtmApi('rtm.tasks.getList', { filter: filterStr });

			if (!response.rsp.tasks || !response.rsp.tasks.list) {
				new Notice('No tasks found.');
				return;
			}

			const parsedTasks: FormattedTask[] = [];
			const lists = Array.isArray(response.rsp.tasks.list) ? response.rsp.tasks.list : [response.rsp.tasks.list];

			for (const list of lists) {
				if (!list.taskseries) continue;
				const seriesArray = Array.isArray(list.taskseries) ? list.taskseries : [list.taskseries];
				
				for (const s of seriesArray) {
					const name = s.name;
					const task = Array.isArray(s.task) ? s.task[0] : s.task;
					
					let realListId = list.id;
					if (!realListId && s.list_id) realListId = s.list_id;
					if (!realListId) realListId = "MISSING"; 

					// Date
					let dueDisplay = "";
					if (task.due && task.due !== "") {
						const datePart = task.due.split('T')[0];
						dueDisplay = ` 📅 ${datePart}`;
					}

					// Priority
					let priDisplay = "";
					switch (task.priority) {
						case '1': priDisplay = " 🔺"; break;
						case '2': priDisplay = " 🔼"; break;
						case '3': priDisplay = " 🔽"; break;
					}

					// List Name
					let listNameDisplay = "";
					const listName = listMap[realListId];
					if (listName) listNameDisplay = listName;

					// Tags
					const tagArray: string[] = [];
					if (s.tags && s.tags.tag) {
						const rawTags = Array.isArray(s.tags.tag) ? s.tags.tag : [s.tags.tag];
						rawTags.forEach((t: string) => tagArray.push(t));
					}

					parsedTasks.push({
						name: name,
						due: dueDisplay,
						priority: priDisplay,
						listName: listNameDisplay,
						tags: tagArray,
						rtmId: { list: realListId, series: s.id, task: task.id },
						rawPriority: task.priority,
						rawDue: task.due
					});
				}
			}

			if (showSelectionUI) {
				new TaskImportModal(this.app, parsedTasks, (selectedTasks) => {
					this.insertParsedTasks(editor, selectedTasks);
				}).open();
			} else {
				this.insertParsedTasks(editor, parsedTasks);
			}

		} catch (e) { console.error(e); new Notice('Fetch error.'); }
	}

	insertParsedTasks(editor: Editor, tasks: FormattedTask[]) {
		if (tasks.length === 0) {
			new Notice("No tasks selected.");
			return;
		}

		let textToInsert = "";
		
		for (const t of tasks) {
			let listTag = "";
			if (t.listName) {
				const safeName = t.listName.replace(/[\s,.]+/g, '_');
				listTag = ` #${safeName}`;
			}

			const tagsStr = t.tags.map(tag => ` #${tag}`).join("");
			const idTag = `[🐮](rtm:${t.rtmId.list}:${t.rtmId.series}:${t.rtmId.task})`;

			textToInsert += `- [ ] ${idTag} ${t.name}${t.priority}${t.due}${listTag}${tagsStr}\n`;
		}

		editor.replaceSelection(textToInsert);
		new Notice(`${tasks.length} tasks inserted.`);
	}

	// 2. Add Task
	async addTaskFromEditor(editor: Editor) {
		const cursor = editor.getCursor();
		const lineText = editor.getLine(cursor.line);
		const taskName = lineText.replace(/^[-*] \[[ x]\] /, '').replace(/^[-*] /, '').trim();
		
		if (!taskName) { new Notice('Task name is empty.'); return; }
		new Notice(`Adding: ${taskName}`);

		try {
			const timeline = await this.getTimeline();
			const res = await this.callRtmApi('rtm.tasks.add', { timeline: timeline, name: taskName, parse: '1' });

			const list = Array.isArray(res.rsp.list) ? res.rsp.list[0] : res.rsp.list;
			const listId = list.id;
			const series = Array.isArray(list.taskseries) ? list.taskseries[0] : list.taskseries;
			const taskSeriesId = series.id;
			const taskObj = Array.isArray(series.task) ? series.task[0] : series.task;
			const taskId = taskObj.id;

			const idTag = `[🐮](rtm:${listId}:${taskSeriesId}:${taskId})`;
			const newLine = `- [ ] ${idTag} ${taskName}`;
			editor.setLine(cursor.line, newLine);
			new Notice('Added to RTM!');
		} catch (e) { console.error("Add Task Error:", e); new Notice('Add error.'); }
	}

	// 3. Complete Task
	async completeTaskInEditor(editor: Editor) {
		const cursor = editor.getCursor();
		const lineText = editor.getLine(cursor.line);
		const regex = /\(rtm:([\w\d]+):([\w\d]+):([\w\d]+)\)/;
		const match = lineText.match(regex);

		if (!match) { new Notice(`Error: No RTM Link found.`); return; }

		const listId = match[1];
		const seriesId = match[2];
		const taskId = match[3];

		if (!listId || listId === 'MISSING') { new Notice('Error: List ID invalid.'); return; }

		new Notice('Completing task...');
		try {
			const timeline = await this.getTimeline();
			await this.callRtmApi('rtm.tasks.complete', {
				timeline: timeline,
				list_id: listId,
				taskseries_id: seriesId,
				task_id: taskId
			});
			const completedLine = lineText.replace('- [ ]', '- [x]');
			editor.setLine(cursor.line, completedLine);
			new Notice('Task completed!');
		} catch (e) { console.error("Completion Error:", e); new Notice('Completion error.'); }
	}

	async getTimeline(): Promise<string> {
		if (this.timeline) return this.timeline;
		const res = await this.callRtmApi('rtm.timelines.create');
		this.timeline = res.rsp.timeline;
		return this.timeline!;
	}

	async callRtmApi(method: string, params: any = {}) {
		const apiKey = this.settings.apiKey;
		const sharedSecret = this.settings.sharedSecret;
		if(!apiKey || !sharedSecret) throw new Error("API Key/Secret missing");

		const apiParams: any = { ...params, method: method, api_key: apiKey, format: 'json', auth_token: this.settings.authToken };
		const keys = Object.keys(apiParams).sort();
		let sigString = sharedSecret;
		for (const key of keys) sigString += key + apiParams[key];
		apiParams['api_sig'] = MD5(sigString).toString();

		const url = `${RTM_REST_URL}?${new URLSearchParams(apiParams).toString()}`;
		const res = await requestUrl({ url: url });
		if(res.json.rsp.stat !== 'ok') {
			console.error('API Error:', res.json);
			throw new Error(`API Error: ${res.json.rsp.err?.msg}`);
		}
		return res.json;
	}

	async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
	async saveSettings() { await this.saveData(this.settings); }
}

// --- Import Selection Modal ---
class TaskImportModal extends Modal {
	tasks: FormattedTask[];
	selected: boolean[];
	onSubmit: (selected: FormattedTask[]) => void;

	constructor(app: App, tasks: FormattedTask[], onSubmit: (selected: FormattedTask[]) => void) {
		super(app);
		this.tasks = tasks;
		this.selected = new Array(tasks.length).fill(true);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: `Select Tasks (${this.tasks.length})` });

		const listContainer = contentEl.createDiv();
		listContainer.style.maxHeight = "400px";
		listContainer.style.overflowY = "auto";
		listContainer.style.marginBottom = "10px";

		this.tasks.forEach((task, index) => {
			const itemDiv = listContainer.createDiv();
			itemDiv.style.display = "flex";
			itemDiv.style.alignItems = "center";
			itemDiv.style.padding = "5px 0";
			itemDiv.style.borderBottom = "1px solid var(--background-modifier-border)";

			const checkbox = itemDiv.createEl("input", { type: "checkbox" });
			// ★修正: 配列アクセスが undefined になる可能性を考慮して ?? false を追加
			checkbox.checked = this.selected[index] ?? false;
			checkbox.onchange = (e) => {
				// @ts-ignore
				this.selected[index] = e.target.checked;
			};

			const label = itemDiv.createSpan();
			label.style.marginLeft = "10px";
			let info = `<b>${task.name}</b>`;
			if(task.listName) info += ` <small style="color:var(--text-muted)">[${task.listName}]</small>`;
			if(task.due) info += ` <small style="color:var(--text-accent)">${task.due}</small>`;
			label.innerHTML = info;
		});

		const btnDiv = contentEl.createDiv();
		btnDiv.style.display = "flex";
		btnDiv.style.justifyContent = "flex-end";
		btnDiv.style.gap = "10px";

		const importBtn = btnDiv.createEl("button", { text: "Import Selected" });
		importBtn.className = "mod-cta";
		importBtn.onclick = () => {
			const tasksToImport = this.tasks.filter((_, i) => this.selected[i]);
			this.onSubmit(tasksToImport);
			this.close();
		};
	}

	onClose() { this.contentEl.empty(); }
}

// --- Filter Modal ---
class FilterModal extends Modal {
	onSubmit: (result: string) => void;
	constructor(app: App, onSubmit: (result: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}
	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Filter RTM Tasks" });
		new Setting(contentEl)
			.setName("Search Query")
			.setDesc("e.g. list:Inbox, due:today")
			.addText((text) =>
				text.setValue("status:incomplete").onChange((value) => {}).inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter") { this.onSubmit(text.getValue()); this.close(); }
				})
			);
		new Setting(contentEl).addButton((btn) => btn.setButtonText("Search").setCta().onClick(() => {
			// @ts-ignore
			const input = contentEl.querySelector('input'); 
			if(input) { this.onSubmit(input.value); this.close(); }
		}));
	}
	onClose() { this.contentEl.empty(); }
}

class RtmSettingTab extends PluginSettingTab {
	plugin: RtmPlugin;
	constructor(app: App, plugin: RtmPlugin) { super(app, plugin); this.plugin = plugin; }
	display(): void {
		const {containerEl} = this; containerEl.empty();
		containerEl.createEl('h2', {text: 'Remember The Milk Settings'});
		new Setting(containerEl).setName('API Key').addText(text => text.setValue(this.plugin.settings.apiKey).onChange(async (v) => { this.plugin.settings.apiKey = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName('Shared Secret').addText(text => text.setValue(this.plugin.settings.sharedSecret).onChange(async (v) => { this.plugin.settings.sharedSecret = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName('Auth').addButton(b => b.setButtonText('Start Auth').onClick(async () => await this.startAuthProcess()));
	}
	async startAuthProcess() {
		const rtm = this.plugin;
		const apiKey = rtm.settings.apiKey;
		const sharedSecret = rtm.settings.sharedSecret;
		if (!apiKey || !sharedSecret) { new Notice('Enter keys first'); return; }
		const frobParams:any = { method: 'rtm.auth.getFrob', api_key: apiKey, format: 'json' };
		let sigString = sharedSecret;
		Object.keys(frobParams).sort().forEach(k => sigString += k + frobParams[k]);
		frobParams['api_sig'] = MD5(sigString).toString();
		const frobRes = await requestUrl({ url: `${RTM_REST_URL}?${new URLSearchParams(frobParams).toString()}` });
		const frob = frobRes.json.rsp.frob;
		const authParams:any = { api_key: apiKey, perms: 'delete', frob: frob };
		let authSigString = sharedSecret;
		Object.keys(authParams).sort().forEach(k => authSigString += k + authParams[k]);
		const apiSig = MD5(authSigString).toString();
		window.open(`${RTM_AUTH_URL}?api_key=${apiKey}&perms=delete&frob=${frob}&api_sig=${apiSig}`);
		new TokenModal(this.app, frob, rtm, async () => { this.display(); }).open();
	}
}

class TokenModal extends Modal {
	frob: string; plugin: RtmPlugin; onSuccess: () => void;
	constructor(app: App, frob: string, plugin: RtmPlugin, onSuccess: () => void) { super(app); this.frob = frob; this.plugin = plugin; this.onSuccess = onSuccess; }
	onOpen() {
		const {contentEl} = this;
		new Setting(contentEl).addButton(btn => btn.setButtonText('Finish Auth').setCta().onClick(async () => {
			const apiKey = this.plugin.settings.apiKey;
			const sharedSecret = this.plugin.settings.sharedSecret;
			const tokenParams:any = { method: 'rtm.auth.getToken', api_key: apiKey, format: 'json', frob: this.frob };
			let sig = sharedSecret;
			Object.keys(tokenParams).sort().forEach(k => sig += k + tokenParams[k]);
			tokenParams['api_sig'] = MD5(sig).toString();
			try {
				const res = await requestUrl({ url: `${RTM_REST_URL}?${new URLSearchParams(tokenParams).toString()}` });
				if(res.json.rsp.auth) {
					this.plugin.settings.authToken = res.json.rsp.auth.token;
					await this.plugin.saveSettings();
					new Notice('Success!'); this.onSuccess(); this.close();
				} else { new Notice('Failed.'); }
			} catch (e) { new Notice('Error.'); }
		}));
	}
	onClose() { this.contentEl.empty(); }
}