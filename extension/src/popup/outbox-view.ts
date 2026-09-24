// The list of Sparks still in the Outbox, with Edit and Delete.

import type { Message } from "../lib/messages";
import type { Entry, Outbox } from "../lib/outbox";
import { summarizeEntry } from "../lib/present";

const CONFIRM_MS = 3000;

const section = document.querySelector<HTMLElement>("#outbox")!;
const list = document.querySelector<HTMLUListElement>("#outbox-list")!;

export function renderOutbox(outbox: Outbox, onEdit: (entry: Entry) => void): void {
  section.hidden = outbox.length === 0;
  list.replaceChildren(...outbox.map((entry) => row(entry, onEdit)));
}

function row(entry: Entry, onEdit: (entry: Entry) => void): HTMLLIElement {
  const summary = summarizeEntry(entry, new Date());
  const item = document.createElement("li");
  item.append(line(summary.text), line(`${summary.domain} · ${summary.age}`, "muted"));
  if (summary.problem) item.append(line(summary.problem, "bad"));
  if (summary.advice) item.append(line(summary.advice, "muted"));
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(button("Edit", () => onEdit(entry)), deleteButton(entry.spark.id));
  item.append(actions);
  return item;
}

/** Popups can't show confirm(), so Delete asks again in place. */
function deleteButton(id: string): HTMLButtonElement {
  const del = button("Delete", () => {
    if (del.dataset.armed) {
      void browser.runtime.sendMessage({ type: "delete", id } satisfies Message);
      return;
    }
    del.dataset.armed = "yes";
    del.textContent = "Really delete?";
    setTimeout(() => {
      delete del.dataset.armed;
      del.textContent = "Delete";
    }, CONFIRM_MS);
  });
  return del;
}

function line(text: string, className?: string): HTMLDivElement {
  const div = document.createElement("div");
  div.textContent = text;
  if (className) div.className = className;
  return div;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "secondary small";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}
