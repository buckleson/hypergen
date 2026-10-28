# job

The state of a job started with [`generate`](./generate.md): its status and progress estimate, and, once it has succeeded, the files it made, saved where `generate` was told, and, from a [local model](../models.md#local), its `details`. `cancel` stops a job. A job lives in the app for the session: it is gone once the app restarts.

| | |
| --- | --- |
| MCP tool | `job` |
| CLI | `hypergen job <id>` |

## Input

| Field | Type | CLI | Description |
| --- | --- | --- | --- |
| `id` | `string`, required | `<id>` | job id, as `generate` returned it |
| `cancel` | `boolean` | `--cancel` | cancel the job |

## Polling

A job is `queued`, then `running`, then ends `succeeded`, `failed` or `canceled`. Once it has ended, nothing about it changes again: stop polling. While it works, the job says how long to wait — `etaRemainingSeconds` while running, `etaSeconds` (the whole run) while queued — so look once around then rather than in a tight loop; a call made early simply returns the job still working. Images take seconds, video minutes. A local model's job also reports its `phase` and `progress` (0..1 through it).

The first call that sees the job succeed downloads its files to where [`generate`](./generate.md#where-the-files-go) was told and returns their paths in `assets`; later calls return the same paths without downloading again. A job whose files are in the open project's library already is never downloaded again: `assets` lists the files of it still there, so a lookup changes nothing. Jobs are kept for the session only: once the app restarts or reloads, `job` answers `not-found` for any job started before.

From a shell, `hypergen job` exits `1` once the job has failed or was canceled, and prints the job either way:

```bash
id=$(hypergen generate flux-2-klein --prompt "A red fox at dawn" | jq -r .id)
sleep 15
hypergen job "$id" | jq '{status, etaRemainingSeconds, assets: [.assets[].path]}'
```

## Local jobs

A [local model](../models.md#local)'s job runs in the app, and its id starts with `local-`. It is polled and canceled like any other and needs no API key; like every job, it lives only as long as the app. Its files are saved when it succeeds, and its `details` — what the model found, with a picture as `details.image` that over MCP also arrives inline, once — come with every poll from then on. Closing the project its files go into cancels it.

## Looking up a generated file

Every file the library holds from a model — made in the app's prompt box or with `generate` — records the job it came from in the project's `assets.yml`, as `job`. While the app is still running the session that made it, pass that id here to see how it was made: `request` holds the model, the prompt and every other field, with each input file as the data URI that was sent.

```yaml
# assets.yml
assets:
  - id: eb9b19faf784b692
    path: red-fox-at-dawn.png
    source: assets/red-fox-at-dawn.png
    # …
    job: b22bbf6f-4c94-4a5b-a4c7-98c696706906
```

```bash
hypergen job b22bbf6f-4c94-4a5b-a4c7-98c696706906 | jq .request
```

## Output

The job, with the files it made saved locally: each file's `url` is replaced by its absolute `path`, and by its library `src` when it went into the project's library. See [`generate`](./generate.md#output) for the fields to act on. A failed or canceled job says why in `error`.

## Errors

- `not-found` — no job of this session has the id: jobs live in the app for the session, and are gone once it restarts or reloads.
