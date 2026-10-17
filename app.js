const DB_NAME = "middelauto-gallery";
const DB_VERSION = 1;
const STORE_NAME = "projects";
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const grid = document.querySelector("#project-grid");
const dialog = document.querySelector("#project-dialog");
const form = document.querySelector("#project-form");
const formMessage = document.querySelector("#form-message");
const saveButton = document.querySelector("#save-button");
const searchInput = document.querySelector("#search-input");
const emptyState = document.querySelector("#empty-state");
const noResults = document.querySelector("#no-results");
const filterButtons = [...document.querySelectorAll(".filter-chip")];

let projects = [];
let activeFilter = "All";
let beforePreviewUrl;
let afterPreviewUrl;
let renderedImageUrls = [];

document.querySelector("#current-year").textContent = new Date().getFullYear();
document.querySelector('[name="date"]').value = new Date().toISOString().slice(0, 10);
document.querySelector("#add-project-button").addEventListener("click", openDialog);
document.querySelector("#empty-add-button").addEventListener("click", openDialog);
document.querySelector("#close-dialog-button").addEventListener("click", closeDialog);
document.querySelector("#cancel-button").addEventListener("click", closeDialog);
searchInput.addEventListener("input", renderProjects);

for (const button of filterButtons) {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    for (const item of filterButtons) item.classList.toggle("selected", item === button);
    renderProjects();
  });
}

for (const name of ["before", "after"]) {
  form.elements[name].addEventListener("change", () => previewImage(name));
}

form.addEventListener("submit", saveProject);
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) closeDialog();
});

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readProjects() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      database.close();
      resolve(request.result.sort((a, b) => b.date.localeCompare(a.date)));
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

async function writeProject(project) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(project);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
    transaction.onabort = () => { database.close(); reject(transaction.error); };
  });
}

async function removeProject(id) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
    transaction.onabort = () => { database.close(); reject(transaction.error); };
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function formattedDate(date) {
  if (!date) return "Date not set";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short" })
    .format(new Date(`${date}T12:00:00`));
}

function renderProjects() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = projects.filter((project) => {
    const matchesFilter = activeFilter === "All" || project.service === activeFilter;
    const matchesSearch = `${project.customer} ${project.vehicle} ${project.service}`
      .toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  for (const url of renderedImageUrls) URL.revokeObjectURL(url);
  renderedImageUrls = [];
  grid.replaceChildren();
  for (const project of filtered) grid.append(createProjectCard(project));
  document.querySelector("#all-count").textContent = projects.length;
  document.querySelector("#results-label").textContent = projects.length
    ? `${filtered.length} ${filtered.length === 1 ? "project" : "projects"}`
    : "";
  emptyState.hidden = projects.length > 0;
  noResults.hidden = projects.length === 0 || filtered.length > 0;
}

function createProjectCard(project) {
  const card = document.createElement("article");
  card.className = "project-card";
  const customer = escapeHtml(project.customer);
  const vehicle = escapeHtml(project.vehicle);
  const service = escapeHtml(project.service);
  const date = escapeHtml(formattedDate(project.date));
  const beforeUrl = URL.createObjectURL(project.before);
  const afterUrl = URL.createObjectURL(project.after);
  renderedImageUrls.push(beforeUrl, afterUrl);

  card.innerHTML = `
    <div class="comparison">
      <span class="comparison-label">BEFORE</span>
      <span class="comparison-label after">AFTER</span>
      <img src="${beforeUrl}" alt="Before: ${vehicle}" loading="lazy">
      <img src="${afterUrl}" alt="After: ${vehicle}" loading="lazy">
    </div>
    <div class="project-info">
      <div>
        <h3>${customer}</h3>
        <p class="project-vehicle">${vehicle}</p>
        <span class="project-service">${service}</span>
        ${project.notes ? `<p class="project-vehicle">${escapeHtml(project.notes)}</p>` : ""}
        <button class="delete-button" type="button">Remove project</button>
      </div>
      <time class="project-date">${date}</time>
    </div>`;
  card.querySelector(".delete-button").addEventListener("click", async () => {
    if (!window.confirm(`Remove ${project.customer}'s project from this browser?`)) return;
    try {
      await removeProject(project.id);
      await loadProjects();
    } catch (error) {
      console.error("Could not remove gallery project.", error);
      window.alert("The project could not be removed. Please try again.");
    }
  });
  return card;
}

function previewImage(name) {
  const input = form.elements[name];
  const preview = document.querySelector(`#${name}-preview`);
  const file = input.files[0];
  const previousUrl = name === "before" ? beforePreviewUrl : afterPreviewUrl;
  if (previousUrl) URL.revokeObjectURL(previousUrl);

  if (!file) {
    preview.innerHTML = '<span class="upload-plus">＋</span><span>Choose a photo</span>';
    return;
  }
  if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES) {
    input.value = "";
    preview.innerHTML = '<span class="upload-plus">＋</span><span>Choose a photo</span>';
    formMessage.textContent = file.size > MAX_IMAGE_BYTES
      ? "Each image must be 15 MB or smaller."
      : "Choose a valid image file.";
    return;
  }

  const url = URL.createObjectURL(file);
  if (name === "before") beforePreviewUrl = url;
  else afterPreviewUrl = url;
  preview.innerHTML = `<img src="${url}" alt="${name} photo preview">`;
  formMessage.textContent = "";
}

async function saveProject(event) {
  event.preventDefault();
  formMessage.textContent = "";
  if (!form.reportValidity()) return;

  const before = form.elements.before.files[0];
  const after = form.elements.after.files[0];
  if (!before || !after) {
    formMessage.textContent = "Choose both a before photo and an after photo.";
    return;
  }
  if ([before, after].some((file) => !file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES)) {
    formMessage.textContent = "Choose image files that are each 15 MB or smaller.";
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Saving…";
  const data = new FormData(form);
  const project = {
    id: crypto.randomUUID(),
    customer: data.get("customer").trim(),
    vehicle: data.get("vehicle").trim(),
    service: data.get("service"),
    date: data.get("date"),
    notes: data.get("notes").trim(),
    before,
    after,
  };
  try {
    await writeProject(project);
    await loadProjects();
    closeDialog();
  } catch (error) {
    console.error("Could not save gallery project.", error);
    formMessage.textContent = "Couldn't save this project in your browser. Check available storage and try again.";
  } finally {
    saveButton.disabled = false;
    saveButton.innerHTML = 'Save project <span aria-hidden="true">↗</span>';
  }
}

function closeDialog() {
  dialog.close();
  form.reset();
  form.elements.date.value = new Date().toISOString().slice(0, 10);
  formMessage.textContent = "";
  beforePreviewUrl = clearPreview("before", beforePreviewUrl);
  afterPreviewUrl = clearPreview("after", afterPreviewUrl);
}

function openDialog() {
  formMessage.textContent = "";
  dialog.showModal();
}

function clearPreview(name, url) {
  if (url) URL.revokeObjectURL(url);
  document.querySelector(`#${name}-preview`).innerHTML =
    '<span class="upload-plus">＋</span><span>Choose a photo</span>';
  return undefined;
}

async function loadProjects() {
  projects = await readProjects();
  renderProjects();
}

loadProjects().catch((error) => {
  console.error("Could not load gallery projects.", error);
  grid.innerHTML = '<p class="storage-error">Your gallery could not be loaded. Check browser storage permissions and refresh the page.</p>';
});
