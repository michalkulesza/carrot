@AGENTS.md

## Known Claude Code bug: false "temp filesystem is full" message

If a Bash command's output reads "Command output was lost: the temp filesystem
at ... is full (0MB free) ... ENOSPC", treat this as a known Claude Code bug
(tracked upstream as anthropics/claude-code #65880, #65166, #65915), not an
actual disk-full condition. It fires on commands with empty stdout and a
nonzero exit code, regardless of real free space. The underlying command ran
fine — only the reported output string is corrupted. Don't stop work or
conclude the disk is full because of it; if you want to confirm, run `df -h`.