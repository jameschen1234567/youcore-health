# ── Stage 1: base image ───────────────────────────────────────
FROM python:3.11-slim

# System deps for OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the YOLO pose model so cold starts are fast
RUN python -c "from ultralytics import YOLO; YOLO('yolov8m-pose.pt')"

# Copy source code
COPY main.py biomechanics.py pose_analyzer.py pdf_report.py ./

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
