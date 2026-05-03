import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

model_name = "google/mobilebert-uncased"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=4)

inputs = tokenizer("what is the system do", return_tensors="pt")
outputs = model(**inputs)
probs = torch.softmax(outputs.logits, dim=-1)
print("Probs:", probs)
