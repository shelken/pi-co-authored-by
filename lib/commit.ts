/**
 * Pure logic for detecting and rewriting git commit commands with trailers.
 * Separated from the pi extension API for testability.
 */

/** Check if a command is a `git commit` with a -m message flag. */
export function isGitCommit(cmd: string): boolean {
	const normalized = cmd.replace(/\\\n/g, " ");
	return /\bgit\s+commit\b/.test(normalized) && /\s-[^\s]*m\b/.test(normalized);
}

interface Segment {
	text: string;
	/** Separator between this segment and the next. Empty for the last segment. */
	sep: string;
}

/**
 * Split a shell command into individual segments at &&, ||, ;, | boundaries.
 * Returns each segment with its following separator.
 * Respects single and double quotes to avoid splitting inside arguments.
 */
function splitSegments(cmd: string): Segment[] {
	const segments: Segment[] = [];
	let current = "";
	let inSingle = false;
	let inDouble = false;
	let i = 0;
	while (i < cmd.length) {
		const ch = cmd[i];
		if (ch === "'" && !inDouble) inSingle = !inSingle;
		else if (ch === '"' && !inSingle) inDouble = !inDouble;

		if (!inSingle && !inDouble) {
			// Check 2-char separators first
			if (cmd.startsWith("&&", i) || cmd.startsWith("||", i)) {
				segments.push({ text: current.trim(), sep: cmd.slice(i, i + 2) });
				current = "";
				i += 2;
				continue;
			}
			if (ch === ";" || ch === "|") {
				segments.push({ text: current.trim(), sep: ch });
				current = "";
				i++;
				continue;
			}
		}
		current += ch;
		i++;
	}
	const text = current.trim();
	if (text) segments.push({ text, sep: "" });
	return segments;
}

/** Build the rewritten command with Co-Authored-By and Generated-By trailers. */
export function appendTrailers(cmd: string, modelName: string, piVersion: string): string {
	const normalized = cmd.replace(/\\\n/g, " ");
	const trailers = `Co-Authored-By: ${modelName} <noreply@pi.dev>\\nGenerated-By: pi ${piVersion}`;
	const suffix = ` -m "" -m $'${trailers}'`;

	// Find the git commit segment and append trailers only to it
	const segments = splitSegments(normalized);
	const commitIdx = segments.findIndex(
		(s) => /\bgit\s+commit\b/.test(s.text) && /\s-[^\s]*m\b/.test(s.text),
	);
	if (commitIdx === -1) {
		// Fallback: append at end (shouldn't happen since isGitCommit already checked)
		return `${normalized.trimEnd()}${suffix}`;
	}

	segments[commitIdx] = {
		text: segments[commitIdx].text + suffix,
		sep: segments[commitIdx].sep,
	};
	// Rebuild preserving original order and separators
	let result = "";
	for (let i = 0; i < segments.length; i++) {
		result += segments[i].text;
		if (segments[i].sep) {
			result += ` ${segments[i].sep} `;
		}
	}
	return result.trim();
}
