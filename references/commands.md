For an LLM, the minimum useful Coral metadata discovery flow is:

### 1. Discover available schemas (sources)

```powershell
coral sql "SELECT DISTINCT schema_name FROM coral.tables;"
```

Example output:

```text
github
notion
slack
linear
```

This tells the model which sources exist. ([Coral][1])

---

### 2. Discover tables in a source

```powershell
coral sql "SELECT
  schema_name,
  table_name
FROM coral.tables
WHERE schema_name = 'notion';"
```

Example:

```text
notion pages
notion databases
notion users
```

`coral.tables` is the metadata registry Coral exposes for agents. ([Coral][1])

---

### 3. Discover columns in a table

```powershell
coral sql "SELECT *
FROM coral.columns
WHERE schema_name = 'notion'
  AND table_name = 'pages';"
```

or:

```powershell
coral sql "SELECT
  column_name,
  data_type
FROM coral.columns
WHERE schema_name = 'notion'
  AND table_name = 'pages';"
```

This is the most important query before generating SQL. ([Coral][1])

---

### 4. Discover filters supported by a table

```powershell
coral sql "SELECT *
FROM coral.filters
WHERE schema_name = 'notion'
  AND table_name = 'pages';"
```

This helps the model know which filters Coral can push down efficiently. ([Coral][1])

---

### 5. Discover table functions (search endpoints)

```powershell
coral sql "SELECT *
FROM coral.table_functions;"
```

Example:

```text
github.search_issues
github.search_prs
```

Coral docs recommend exposing search APIs as table functions. ([Coral][1])

---

### 6. Discover function arguments

```powershell
coral sql "SELECT *
FROM coral.inputs;"
```

or:

```powershell
coral sql "SELECT *
FROM coral.inputs
WHERE schema_name = 'github';"
```

This tells the model which named parameters a table function accepts. ([Coral][1])

---

### 7. Sample actual rows

After schema discovery:

```powershell
coral sql "SELECT *
FROM notion.pages
LIMIT 5;"
```

This helps the model understand real value formats. ([GitHub][2])

---

## Full agent flow

This is the sequence I would give an LLM:

```powershell
coral sql "SELECT DISTINCT schema_name FROM coral.tables;"
```

↓

```powershell
coral sql "SELECT *
FROM coral.tables
WHERE schema_name = 'notion';"
```

↓

```powershell
coral sql "SELECT *
FROM coral.columns
WHERE schema_name = 'notion'
  AND table_name = 'pages';"
```

↓

```powershell
coral sql "SELECT *
FROM coral.filters
WHERE schema_name = 'notion'
  AND table_name = 'pages';"
```

↓

```powershell
coral sql "SELECT *
FROM notion.pages
LIMIT 5;"
```

↓

Generate final SQL.

---

For a production agent, these Coral metadata objects are the important ones:

| Metadata table          | Purpose                    |
| ----------------------- | -------------------------- |
| `coral.tables`          | List tables                |
| `coral.columns`         | List columns               |
| `coral.filters`         | Supported filters          |
| `coral.inputs`          | Function arguments         |
| `coral.table_functions` | Search/retrieval functions |

Coral's source-authoring docs explicitly tell developers to inspect `coral.tables`, `coral.table_functions`, `coral.columns`, `coral.filters`, and `coral.inputs` when building agents and sources. ([Coral][1])

[1]: https://withcoral.com/docs/guides/write-a-custom-source?utm_source=chatgpt.com "Write a custom source spec - Coral Docs"
[2]: https://github.com/withcoral/coral?utm_source=chatgpt.com "withcoral/coral: One SQL interface over APIs, files, and live ..."
