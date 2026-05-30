import { execSync } from "node:child_process"

function coral(sql) {
  return execSync(`coral sql "${sql.replace(/"/g, '\\"')}"`, {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
  })
}

const pageId = "345d3d36-1787-80a1-8631-fbeced4d3cf1"

console.log(
  coral(
    `SELECT id, properties FROM notion.search WHERE object = 'page' LIMIT 100`
  )
)
