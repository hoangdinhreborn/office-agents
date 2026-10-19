"""
Script to create an Ollama Modelfile and import fine-tuned RL weights into local Ollama.
"""

from pathlib import Path
import subprocess
import sys


def generate_ollama_modelfile(
    model_name: str = "deepseek-r1-custom",
    base_gguf_path: str = "./training/outputs/model-q4_k_m.gguf",
    system_prompt: str = "Bạn là trợ lý AI suy luận học tăng cường giải quyết công việc nội bộ doanh nghiệp.",
):
    modelfile_content = f"""# Ollama Modelfile for Fine-Tuned RL Model
FROM {base_gguf_path}

# Set parameters for reasoning model
PARAMETER temperature 0.6
PARAMETER top_p 0.95
PARAMETER top_k 40

# Custom system prompt
SYSTEM \"\"\"{system_prompt}\"\"\"
"""
    modelfile_path = Path("Modelfile")
    modelfile_path.write_text(modelfile_content, encoding="utf-8")
    print(f"Created Modelfile at: {modelfile_path.absolute()}")
    print("\nĐể nạp mô hình vào Ollama, chạy lệnh sau trong terminal:")
    print(f"  ollama create {model_name} -f Modelfile")
    print(f"  ollama run {model_name}")


if __name__ == "__main__":
    generate_ollama_modelfile()
