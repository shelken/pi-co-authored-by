import { describe, it, expect } from "vitest";
import { isGitCommit, appendTrailers } from "./commit.ts";

describe("isGitCommit", () => {
	it("detects git commit -m", () => {
		expect(isGitCommit('git commit -m "fix bug"')).toBe(true);
	});

	it("detects git commit -am", () => {
		expect(isGitCommit('git commit -am "fix bug"')).toBe(true);
	});

	it("detects git commit with flags before -m", () => {
		expect(isGitCommit('git commit --allow-empty -m "init"')).toBe(true);
	});

	it("detects git commit with flags after -m", () => {
		expect(isGitCommit('git commit -m "msg" --no-verify')).toBe(true);
	});

	it("detects git commit -m without space before value", () => {
		expect(isGitCommit('git commit -m"no space"')).toBe(true);
	});

	it("detects git commit with line continuation", () => {
		expect(isGitCommit('git commit \\\n-m "msg"')).toBe(true);
	});

	it("rejects interactive git commit (no -m)", () => {
		expect(isGitCommit("git commit")).toBe(false);
	});

	it("rejects git commit --amend without -m", () => {
		expect(isGitCommit("git commit --amend")).toBe(false);
	});

	it("rejects non-commit git commands", () => {
		expect(isGitCommit("git log --oneline")).toBe(false);
	});

	it("rejects git status", () => {
		expect(isGitCommit("git status")).toBe(false);
	});

	it("rejects git push", () => {
		expect(isGitCommit("git push origin main")).toBe(false);
	});

	it("rejects empty string", () => {
		expect(isGitCommit("")).toBe(false);
	});

	it("detects git commit --amend -m (amend with new message)", () => {
		expect(isGitCommit('git commit --amend -m "new msg"')).toBe(true);
	});

	it("detects git commit with -S (signed) and -m", () => {
		expect(isGitCommit('git commit -S -m "signed commit"')).toBe(true);
	});

	it("detects git commit in a compound && chain", () => {
		expect(
			isGitCommit(
				'git status --short && git add . && git commit -m "fix" && git push',
			),
		).toBe(true);
	});

	it("detects git commit at end of pipe chain", () => {
		expect(isGitCommit('echo msg | git commit -F - -m "fix"')).toBe(true);
	});
});

describe("appendTrailers", () => {
	it("appends trailers to a simple commit command", () => {
		const result = appendTrailers(
			'git commit -m "fix bug"',
			"Claude Sonnet 4",
			"0.52.12",
		);
		expect(result).toBe(
			`git commit -m "fix bug" -m "" -m $'Co-Authored-By: Claude Sonnet 4 <noreply@pi.dev>\\nGenerated-By: pi 0.52.12'`,
		);
	});

	it("trims trailing whitespace from original command", () => {
		const result = appendTrailers(
			'git commit -m "fix"   ',
			"Claude Sonnet 4",
			"0.52.12",
		);
		expect(result).toMatch(/^git commit -m "fix" -m/);
		expect(result).not.toMatch(/\s{2,}-m ""/);
	});

	it("includes model name in Co-Authored-By", () => {
		const result = appendTrailers(
			'git commit -m "msg"',
			"Gemini 2.5 Pro",
			"1.0.0",
		);
		expect(result).toContain("Co-Authored-By: Gemini 2.5 Pro <noreply@pi.dev>");
	});

	it("includes pi version in Generated-By", () => {
		const result = appendTrailers(
			'git commit -m "msg"',
			"Some Model",
			"1.2.3",
		);
		expect(result).toContain("Generated-By: pi 1.2.3");
	});

	it("uses $'' quoting for the trailer block", () => {
		const result = appendTrailers(
			'git commit -m "msg"',
			"Model",
			"1.0.0",
		);
		// The trailers should be in a single $'...' string with \\n separator
		expect(result).toMatch(/-m \$'Co-Authored-By:.*\\nGenerated-By:.*'/);
	});

	it("handles model name with special characters", () => {
		const result = appendTrailers(
			'git commit -m "msg"',
			"openai/gpt-4o",
			"0.50.0",
		);
		expect(result).toContain("Co-Authored-By: openai/gpt-4o <noreply@pi.dev>");
	});

	it("only modifies the git commit segment in a && chain", () => {
		const result = appendTrailers(
			'git status -s && git add -A && git commit -m "fix" && git push',
			"Claude Sonnet 4",
			"0.52.12",
		);
		// git status and git add should be untouched
		expect(result.startsWith('git status -s && git add -A &&')).toBe(true);
		// commit segment should have trailers
		expect(result).toContain('git commit -m "fix" -m "" -m $\'Co-Authored-By:');
		// git push should be untouched
		expect(result.endsWith("&& git push")).toBe(true);
	});

	it("handles compound command with && on both sides of commit", () => {
		// This is the exact pattern from the bug report
		const cmd =
			'git status --short && git add AGENTS.md && git diff --cached --name-status && git commit -m "Require live Plannotator step completion markers" && git -c alias.status= status --short';
		const result = appendTrailers(cmd, "Gemini 2.5 Pro", "1.0.0");
		// The trailing git status should NOT have -m args
		expect(result.endsWith(
			"&& git -c alias.status= status --short",
		)).toBe(true);
		// The commit segment should have trailers
		expect(result).toContain(
			'git commit -m "Require live Plannotator step completion markers" -m "" -m',
		);
	});

	it("handles || separator", () => {
		const result = appendTrailers(
			'git commit -m "msg" || echo "failed"',
			"Model",
			"1.0.0",
		);
		expect(result.startsWith('git commit -m "msg" -m "" -m')).toBe(true);
		expect(result.endsWith("|| echo \"failed\"")).toBe(true);
	});

	it("respects quotes containing &&", () => {
		const result = appendTrailers(
			'git commit -m "fix && stuff"',
			"Model",
			"1.0.0",
		);
		// Should not split at && inside quotes
		expect(result).toBe(
			'git commit -m "fix && stuff" -m "" -m $\'Co-Authored-By: Model <noreply@pi.dev>\\nGenerated-By: pi 1.0.0\'',
		);
	});
});
