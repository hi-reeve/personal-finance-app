# Changesets

Every pull request needs a changeset: run `pnpm changeset`, pick the affected packages and a bump (patch, minor, major), and write a plain-language note. Use `pnpm changeset --empty` when the change has no release impact. Nothing is published to npm; versions and tags are the release record.
