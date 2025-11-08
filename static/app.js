const form = document.getElementById("upload-form");
const statusEl = document.getElementById("status");
const transcriptEl = document.getElementById("transcript");
const outputSection = document.getElementById("output");
const segmentsDetails = document.getElementById("segments");
const segmentsList = document.getElementById("segments-list");
const audioInput = document.getElementById("audio");
const languageSelect = document.getElementById("language");

const setStatus = (message, type = "") => {
  statusEl.textContent = message;
  statusEl.className = type ? type : "";
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!audioInput.files?.length) {
    setStatus("Choose an audio file first", "error");
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  setStatus("Uploading and transcribing…");

  const formData = new FormData();
  formData.append("audio", audioInput.files[0]);
  if (languageSelect) {
    formData.append("language", languageSelect.value || "auto");
  }

  try {
    const response = await fetch("/transcribe", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to transcribe file");
    }

    setStatus("Transcription complete", "success");
    transcriptEl.textContent = data.text || "[No speech detected]";
    outputSection.hidden = false;

    if (data.segments?.length) {
      segmentsList.innerHTML = "";
      const fragment = document.createDocumentFragment();
      data.segments.forEach(({ start, end, text }) => {
        const item = document.createElement("li");
        const range = document.createElement("strong");
        range.textContent = `${start}s → ${end}s:`;
        item.append(range, " ", text);
        fragment.appendChild(item);
      });
      segmentsList.appendChild(fragment);
      segmentsDetails.hidden = false;
    } else {
      segmentsDetails.hidden = true;
      segmentsList.innerHTML = "";
    }
  } catch (error) {
    setStatus(error.message, "error");
    outputSection.hidden = true;
  } finally {
    submitButton.disabled = false;
  }
});
