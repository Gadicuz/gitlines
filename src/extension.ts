import * as vscode from 'vscode';
import * as git from './git';

type DiffLines = (string|undefined)[];
type LineNumber = number;

type DiffBlock = {
	pos: LineNumber;
	lines: DiffLines;
};

function blockEnd(b: DiffBlock): LineNumber {
	return b.pos + b.lines.length;
}

function blockLen(b: DiffBlock): number {
	return b.lines.length;
}

type DiffHunk = DiffBlock[];

type DiffData = {
	repo: git.Repository;
	stgUri: vscode.Uri;
	isIndex: boolean;
	om: {
		doc: vscode.TextDocument;
		sel: readonly vscode.Range[];
	}[];
};

function newHunk(pos: LineNumber[]): DiffHunk {
	return pos.map((pos) => ({ pos, lines: [] }));
}

function isEmptyHunk(hunk: DiffHunk): boolean {
	return hunk.every((b) => blockLen(b) === 0);
}

function parseDiff(diff: string): DiffHunk[] {
	return diff
		.split(/\r?\n/)
		.reduce<DiffHunk[]>((hunks, text) => {
			const hunkHeader = text.match(/^@@ -(\d+)(,\d+)? \+(\d+)(,\d+)? @@/);
			if (hunkHeader) {
				return [newHunk([+hunkHeader[1], +hunkHeader[3]]), ...hunks];
			}
			const hunk = hunks[0];
			if (hunk) {
				const i = '-+'.indexOf(text[0]);
				if (i < 0) {
					return [newHunk(hunk.map((b) => blockEnd(b) + 1)), ...hunks];
				}
				hunk[i].lines.push(text.slice(1));
			}
			return hunks;
		}, [])
		.filter((h) => !isEmptyHunk(h))
		.reverse();
}

function filterBlocks(block: DiffBlock, selections: readonly vscode.Range[] ) {
	selections = selections.map((s) => s.with(s.start.with(undefined, 0), s.end.with(undefined, 1)));
	const pos = new vscode.Position(block.pos - 1, 0);
	block.lines = block.lines.map((l, i) => selections.find((s) => s.contains(pos.translate(i))) ? l : undefined);
	const head = [...block.lines, ''].findIndex((v) => v !== undefined);
	block.pos += head;
	block.lines = block.lines.slice(head);
	const tail = block.lines.slice().reverse().findIndex((v) => v !== undefined);
	if (tail > 0) {
		block.lines = block.lines.slice(0, -tail);
	}
}

function filterHunks(dd: DiffData): (h: DiffHunk) => DiffHunk {
	return (hunk) => (hunk.forEach((b, i) => filterBlocks(b, dd.om[i].sel)), hunk);
}

function findEditor(uri: vscode.Uri): vscode.TextEditor | undefined {
	const r = uri.toString();
	return vscode.window.visibleTextEditors.find((editor) => editor.document.uri.toString() === r);
}

function getLine(doc: vscode.TextDocument, pos: LineNumber): string {
	return doc.lineAt(pos-1).text;
}

function getText(doc: vscode.TextDocument, blk: DiffBlock, pos: LineNumber): string[] {
	const cnt = blk.pos - pos;
	return cnt > 0 ? Array.from(Array(cnt), (_, i) => getLine(doc, pos+i)) : [];
}

function getLines(doc: vscode.TextDocument, blk: DiffBlock, t: string): string [] {
	return blk.lines.reduce<string []>((lines,l,i) => ((typeof l === t) && lines.push(getLine(doc, blk.pos+i)), lines), []);
}

function assembleText(dd: DiffData, hunks: DiffHunk[]): string {
	const src = dd.isIndex ? 1 : 0;
	let pos: LineNumber = 1;
	return hunks.reduce((lines: string[], hunk: DiffHunk) => {		
			lines.push(...getText(dd.om[src].doc, hunk[src], pos ));
			lines.push(...getLines(dd.om[src].doc, hunk[src], 'undefined'));
			lines.push(...getLines(dd.om[1-src].doc, hunk[1-src], 'string' ));
			pos = blockEnd(hunk[src]);
			return lines;
		}, []).join( {[vscode.EndOfLine.LF]:'\n', [vscode.EndOfLine.CRLF]:'\r\n'}[dd.om[src].doc.eol] );
}

export function activate(context: vscode.ExtensionContext) {
	
	const gitExtension = vscode.extensions.getExtension<git.GitExtension>('vscode.git')!.exports;
	const api = gitExtension.getAPI(1);

	function getData(editor: vscode.TextEditor): Promise<DiffData> {
		return new Promise((resolve, reject) => {
			try {
				const resource = editor.document.uri;
				const stgUri = api.toGitUri(resource, '~');
				const repo = api.getRepository(stgUri);
				if (!repo) {
					throw new Error('Unable to get Git repository.');
				}
				const ref = resource.scheme === 'git' ? JSON.parse(resource.query).ref : undefined;
				const isIndex = ref === 'HEAD' || ref === '';
				const uri2 = ref === '~' ? vscode.Uri.file(resource.path) :
										ref === '' ? api.toGitUri(resource, 'HEAD') :
										ref === 'HEAD' ? api.toGitUri(resource, '') :
										stgUri;
				const editor2 = findEditor(uri2);
				if (!editor2) {
					throw new Error("Can''t locate pair editor.");
				}
				const isLeftPanel = ref === 'HEAD' || ref === '~';
				const ome = isLeftPanel ? [editor, editor2] : [editor2, editor];
				const singleLine = editor.selections.length === 1 && editor.selection.isEmpty;
				const om = ome.map((e) => ({
					doc: e.document,
					sel: singleLine ? (e === editor ? e.selections : []) : e.selections.filter((s) => !s.isEmpty)
				}));
				resolve({ repo, stgUri, isIndex,	om });
			}
			catch(e)
			{
				reject(e);
			}
		});
	}

	const processLines = (editor: vscode.TextEditor) => {
		getData(editor)
			.then((dd) => dd.repo.diff(dd.isIndex).then((diff) => {
				const hunks = parseDiff(diff).map(filterHunks(dd)).filter((h) => !isEmptyHunk(h));
				hunks.push(newHunk(dd.om.map((om) => om.doc.lineCount + 1)));
				const text = assembleText(dd, hunks);
				return (dd.repo as any)._repository.stage(dd.stgUri, text);
			}))
			.catch((e) => vscode.window.showErrorMessage(e.toString()));
	};

	const commands = ['StageLine', 'UnstageLine', 'StageLines', 'UnstageLines'];
	context.subscriptions.push(...commands.map((c) => vscode.commands.registerTextEditorCommand('gitlines.'+c,processLines)));
}

export function deactivate() {}
