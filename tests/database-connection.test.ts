import assert from "node:assert/strict";
import test from "node:test";
import { databaseConnectionUrl } from "../src/lib/database-connection";

test("MySQL connections get bounded pools and explicit connection timeouts", () => {
  const url = new URL(databaseConnectionUrl("mysql://qa:fixture%40only@localhost:3306/test?sslaccept=strict")!);
  assert.equal(url.searchParams.get("connection_limit"), "5");
  assert.equal(url.searchParams.get("connect_timeout"), "15");
  assert.equal(url.searchParams.get("pool_timeout"), "15");
  assert.equal(url.searchParams.get("sslaccept"), "strict");
  assert.equal(url.password, "fixture%40only");
});

test("deployment connection settings are preserved", () => {
  const url = new URL(databaseConnectionUrl("mysql://localhost/test?connection_limit=2&connect_timeout=30&pool_timeout=25")!);
  assert.equal(url.searchParams.get("connection_limit"), "2");
  assert.equal(url.searchParams.get("connect_timeout"), "30");
  assert.equal(url.searchParams.get("pool_timeout"), "25");
  assert.equal(databaseConnectionUrl(undefined), undefined);
  assert.equal(databaseConnectionUrl("file:./test.db"), "file:./test.db");
});
