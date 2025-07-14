# Legacy container image for the Python implementation.
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# The bot reads the token from the BOT_TOKEN environment variable if no
# argument is supplied at runtime.
CMD ["python", "bot.py"]
