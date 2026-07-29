## MCP tool token cost

Measured with `o200k_base` over the complete json-serialized mcp tools/list result payload: { tools }.
Targets are advisory except the enforced total-token budget.

| Metric              | Current | Target | Status        |
| ------------------- | ------: | -----: | ------------- |
| Tools               |      26 |   ≤ 20 | Above target  |
| Total tokens        |    7946 | ≤ 8900 | Within target |
| Average tokens/tool |  305.62 |  < 600 | Within target |

### Component totals

| Component      | Tokens |
| -------------- | -----: |
| `name`         |    153 |
| `description`  |    560 |
| `inputSchema`  |   3400 |
| `outputSchema` |   3033 |
| `annotations`  |    606 |

### Change from baseline

| Metric              | Baseline | Current | Delta |
| ------------------- | -------: | ------: | ----: |
| Tools               |       26 |      26 |     0 |
| Total tokens        |     7946 |    7946 |     0 |
| Average tokens/tool |   305.62 |  305.62 |     0 |

### Per-tool changes

| Tool                        | Baseline | Current | Delta |
| --------------------------- | -------: | ------: | ----: |
| `create-body-measurement`   |      328 |     328 |     0 |
| `create-exercise-template`  |      354 |     354 |     0 |
| `create-routine`            |      420 |     420 |     0 |
| `create-routine-folder`     |      109 |     109 |     0 |
| `create-workout`            |      532 |     532 |     0 |
| `get-body-measurement`      |      300 |     300 |     0 |
| `get-body-measurements`     |      372 |     372 |     0 |
| `get-exercise-history`      |      247 |     247 |     0 |
| `get-exercise-template`     |      172 |     172 |     0 |
| `get-exercise-templates`    |      254 |     254 |     0 |
| `get-routine`               |      314 |     314 |     0 |
| `get-routine-folder`        |      142 |     142 |     0 |
| `get-routine-folders`       |      224 |     224 |     0 |
| `get-routines`              |      277 |     277 |     0 |
| `get-training-summary`      |      624 |     624 |     0 |
| `get-user-info`             |      133 |     133 |     0 |
| `get-workout`               |      322 |     322 |     0 |
| `get-workout-count`         |      109 |     109 |     0 |
| `get-workout-events`        |      499 |     499 |     0 |
| `get-workouts`              |      273 |     273 |     0 |
| `replace-workout-exercises` |      416 |     416 |     0 |
| `search-exercise-templates` |      258 |     258 |     0 |
| `search-routines`           |      280 |     280 |     0 |
| `update-body-measurement`   |      328 |     328 |     0 |
| `update-routine`            |      423 |     423 |     0 |
| `update-workout`            |      232 |     232 |     0 |

### Component changes

| Component      | Delta |
| -------------- | ----: |
| `name`         |     0 |
| `description`  |     0 |
| `inputSchema`  |     0 |
| `outputSchema` |     0 |
| `annotations`  |     0 |

### Per-tool breakdown

| Tool                        | `name` | `description` | `inputSchema` | `outputSchema` | `annotations` | Total | Share of total |
| --------------------------- | -----: | ------------: | ------------: | -------------: | ------------: | ----: | -------------: |
| `get-training-summary`      |      5 |            30 |            31 |            531 |            19 |   624 |          7.85% |
| `create-workout`            |      5 |            20 |           470 |              0 |            31 |   532 |           6.7% |
| `get-workout-events`        |      6 |            22 |            84 |            360 |            19 |   499 |          6.28% |
| `update-routine`            |      5 |            18 |           363 |              0 |            31 |   423 |          5.32% |
| `create-routine`            |      5 |            20 |           358 |              0 |            31 |   420 |          5.29% |
| `replace-workout-exercises` |      7 |            17 |           354 |              0 |            32 |   416 |          5.24% |
| `get-body-measurements`     |      7 |            24 |            62 |            252 |            19 |   372 |          4.68% |
| `create-exercise-template`  |      6 |            18 |           292 |              0 |            32 |   354 |          4.46% |
| `create-body-measurement`   |      7 |            24 |           259 |              0 |            32 |   328 |          4.13% |
| `update-body-measurement`   |      7 |            24 |           259 |              0 |            32 |   328 |          4.13% |
| `get-workout`               |      5 |            23 |            33 |            235 |            18 |   322 |          4.05% |
| `get-routine`               |      5 |            23 |            31 |            229 |            18 |   314 |          3.95% |
| `get-body-measurement`      |      7 |            25 |            43 |            198 |            19 |   300 |          3.78% |
| `search-routines`           |      5 |            24 |            42 |            182 |            19 |   280 |          3.52% |
| `get-routines`              |      5 |            23 |            62 |            160 |            19 |   277 |          3.49% |
| `get-workouts`              |      5 |            25 |            47 |            169 |            19 |   273 |          3.44% |
| `search-exercise-templates` |      7 |            25 |           113 |             86 |            19 |   258 |          3.25% |
| `get-exercise-templates`    |      7 |            21 |            62 |            137 |            19 |   254 |           3.2% |
| `get-exercise-history`      |      6 |            22 |            58 |            134 |            19 |   247 |          3.11% |
| `update-workout`            |      5 |            17 |           173 |              0 |            31 |   232 |          2.92% |
| `get-routine-folders`       |      7 |            15 |            62 |            112 |            20 |   224 |          2.82% |
| `get-exercise-template`     |      6 |            23 |            33 |             83 |            19 |   172 |          2.16% |
| `get-routine-folder`        |      6 |            22 |            31 |             56 |            19 |   142 |          1.79% |
| `get-user-info`             |      5 |            20 |            14 |             67 |            19 |   133 |          1.67% |
| `create-routine-folder`     |      6 |            15 |            50 |              0 |            32 |   109 |          1.37% |
| `get-workout-count`         |      6 |            20 |            14 |             42 |            19 |   109 |          1.37% |

Per-component counts are diagnostic and non-additive because keys and separators live in complete tool objects. Per-tool counts encode each complete tool object independently. The total encodes the complete `{ tools }` envelope, so punctuation and separators mean the per-tool values need not sum exactly to the total.
