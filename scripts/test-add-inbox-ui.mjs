import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const app = read("src/client/App.tsx");
const sidebar = read("src/client/components/Sidebar.tsx");
const mobile = read("src/client/components/MobileNav.tsx");
const settings = read("src/client/components/SettingsModal.tsx");
const dialog = read("src/client/components/AddInboxModal.tsx");
const labels = read("src/client/mailUtils.ts");

assert.equal((app.match(/onAddInbox={openAddInbox}/g) ?? []).length, 2,
  "Desktop and mobile should share the same Add Inbox handler");
assert.match(app, /onAddInbox={openAddInbox}/);
assert.match(app, /<AddInboxModal/);
assert.match(app, /onChooseCustom={\(\) => setAddInboxMode\("custom"\)}/);
assert.match(app, /onChooseGmail={\(\) => void connectGmail\(\)}/);
assert.match(app, /onCustomSignedIn={\(\) => window.location.reload\(\)}/);
assert.match(dialog, /<AccountSignIn showGoogle={false}/,
  "Custom email should use the existing authenticated mailbox login");
assert.match(dialog, /Custom email/);
assert.match(dialog, /Gmail/);
assert.match(sidebar, /Add Inbox/);
assert.match(mobile, /Add Inbox/);
assert.match(settings, /Add Inbox/);
assert.doesNotMatch(sidebar, /accounts\.some\(.*provider === "gmail"/,
  "Add Inbox must still be shown after connecting Gmail");
assert.doesNotMatch(mobile, /accounts\.some\(.*provider === "gmail"/);
assert.doesNotMatch(settings, /Add Gmail inbox|Add custom email/,
  "Account addition should have one entry point in Settings");
for (const [name, contents] of [
  ["Sidebar", sidebar], ["MobileNav", mobile], ["SettingsModal", settings],
]) {
  assert.doesNotMatch(contents, /Add Gmail/, name + " still exposes legacy Gmail-only action");
}
for (const [name, contents] of [
  ["SettingsModal", settings], ["Sidebar", sidebar], ["MobileNav", mobile],
  ["MailList", read("src/client/components/MailList.tsx")],
  ["TopBar", read("src/client/components/TopBar.tsx")],
  ["mailUtils", labels],
]) {
  assert.doesNotMatch(contents, /Turn (?:on|off)/i, name + " uses an outdated toggle label");
}
assert.match(settings, /"Disable" : "Enable"/);
assert.match(labels, /case "on": return "Disable notifications"/);
assert.match(labels, /case "off": return "Enable notifications"/);
console.log("Add Inbox entry points, provider choices and action labels verified.");
