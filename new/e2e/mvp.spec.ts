import {expect, test} from "@playwright/test";

test.describe("Notebook MVP scaffold", () => {
  test("login flow", async ({page}) => {
    await page.goto("/");
    await expect(page.getByRole("button", {name: /đăng nhập|dang nhap|login/i})).toBeVisible();
  });

  test.skip("create notebook and upload a PDF", async () => {});
  test.skip("ask a question and verify a cited answer is returned", async () => {});
  test.skip("click a citation and verify source viewer opens at the correct location", async () => {});
  test.skip("save answer as note and verify it appears in the Notes panel", async () => {});
  test.skip("mobile viewport bottom tab navigation works", async () => {});
});
