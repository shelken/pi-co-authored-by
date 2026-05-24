/**
 * Pure logic for detecting git commit commands and wrapping git with trailers.
 * Separated from the pi extension API for testability.
 */

/** Check if a command may contain a direct `git commit` invocation. */
export function containsGitCommit(cmd: string): boolean {
	const normalized = cmd.replace(/\\\n/g, " ");
	return /\bgit\b[\s\S]*\bcommit\b/.test(normalized);
}

/** Build a bash command that appends trailers to direct `git commit` calls. */
export function wrapGitWithTrailers(
	cmd: string,
	modelName: string,
	piVersion: string,
): string {
	const coAuthor = `Co-Authored-By: ${modelName} <noreply@pi.dev>`;
	const generatedBy = `Generated-By: pi ${piVersion}`;

	return `${buildGitWrapper(coAuthor, generatedBy)}\n${cmd}`;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildGitWrapper(coAuthor: string, generatedBy: string): string {
	return `git() (
  set +u
  local -a __pi_git_original=("$@")
  local -a __pi_git_globals=()

  while (($#)); do
    case "$1" in
      -c|-C|--config-env|--exec-path|--git-dir|--work-tree|--namespace)
        __pi_git_globals+=("$1")
        shift
        if (($#)); then
          __pi_git_globals+=("$1")
          shift
        fi
        ;;
      -c*|-C*|--config-env=*|--exec-path=*|--git-dir=*|--work-tree=*|--namespace=*)
        __pi_git_globals+=("$1")
        shift
        ;;
      --bare|--no-pager|--paginate|--no-replace-objects|--literal-pathspecs|--glob-pathspecs|--noglob-pathspecs|--icase-pathspecs|--no-optional-locks)
        __pi_git_globals+=("$1")
        shift
        ;;
      commit)
        shift
        local -a __pi_git_before_pathspec=()
        local -a __pi_git_after_pathspec=()
        local __pi_git_seen_pathspec=0

        while (($#)); do
          if [[ "$1" == "--" && "$__pi_git_seen_pathspec" == 0 ]]; then
            __pi_git_seen_pathspec=1
            __pi_git_after_pathspec+=("$1")
          elif [[ "$__pi_git_seen_pathspec" == 0 ]]; then
            __pi_git_before_pathspec+=("$1")
          else
            __pi_git_after_pathspec+=("$1")
          fi
          shift
        done

        command git \
          "\${__pi_git_globals[@]}" \
          -c trailer.co-authored-by.ifExists=addIfDifferent \
          -c trailer.generated-by.ifExists=replace \
          commit \
          "\${__pi_git_before_pathspec[@]}" \
          --trailer ${shellQuote(coAuthor)} \
          --trailer ${shellQuote(generatedBy)} \
          "\${__pi_git_after_pathspec[@]}"
        return
        ;;
      *)
        command git "\${__pi_git_original[@]}"
        return
        ;;
    esac
  done

  command git "\${__pi_git_original[@]}"
)`;
}
