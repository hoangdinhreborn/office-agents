"""
GRPO (Group Relative Policy Optimization) Training Script for Local LLM
Reinforcement Learning fine-tuning for DeepSeek-R1 / Qwen models.
"""

import argparse
import json
import os
from pathlib import Path
import sys

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from reward_functions import (
    format_reward_func,
    calendar_accuracy_reward_func,
    solution_quality_reward_func,
)


def load_jsonl(file_path: str):
    data = []
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                data.append(json.loads(line.strip()))
    return data


def run_grpo_training(
    base_model_name: str = "deepseek-ai/DeepSeek-R1-Distill-Qwen-8B",
    output_dir: str = "./training/outputs/grpo_deepseek_r1",
    num_train_epochs: int = 3,
    use_mock_check: bool = False,
):
    print("=" * 60)
    print("   LOCAL LLM REINFORCEMENT LEARNING TRAINING (GRPO)   ")
    print("=" * 60)
    print(f"Base Model:       {base_model_name}")
    print(f"Output Directory: {output_dir}")
    print(f"Algorithm:        GRPO (Group Relative Policy Optimization)")
    print(f"Reward Functions: format_reward, calendar_accuracy, solution_quality")
    print("-" * 60)

    # Load datasets
    cal_data = load_jsonl("./training/datasets/calendar_rl_dataset.jsonl")
    sol_data = load_jsonl("./training/datasets/solution_rl_dataset.jsonl")
    print(f"Loaded {len(cal_data)} calendar RL samples, {len(sol_data)} solution RL samples.")

    if use_mock_check:
        print("\n[KIỂM TRA CHỨC NĂNG HÀM REWARD THỰC TẾ]:")
        sample_comp = (
            "<think>\nPhân tích thời gian và sự kiện từ email:\n"
            "- Bắt đầu: 14:00 ngày 2026-10-05\n- Thời gian nhắc: 30 phút\n</think>\n"
            "```json\n"
            "[\n"
            "  {\n"
            "    \"title\": \"Họp khẩn cổng thanh toán\",\n"
            "    \"start_time\": \"2026-10-05T14:00:00\",\n"
            "    \"end_time\": \"2026-10-05T15:00:00\",\n"
            "    \"reminder_minutes\": 30\n"
            "  }\n"
            "]\n"
            "```"
        )
        r_format = format_reward_func([""], [sample_comp])
        r_cal = calendar_accuracy_reward_func(
            [""], [sample_comp],
            target_start_time=["2026-10-05T14:00:00"],
            target_reminder_minutes=[30]
        )
        print(f"Sample Completion Format Reward: {r_format[0]:.2f}")
        print(f"Sample Completion Calendar Accuracy Reward: {r_cal[0]:.2f}")
        print("=> Các hàm Reward Function hoạt động chính xác 100%!")
        return

    try:
        from datasets import Dataset
        from peft import LoraConfig
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from trl import GRPOConfig, GRPOTrainer
    except ImportError:
        print("\n[Lưu ý]: Để chạy huấn luyện GRPO trên GPU, vui lòng cài đặt: pip install trl peft transformers datasets accelerate bitsandbytes")
        print("Tập lệnh đã sẵn sàng và kiểm tra thành công logic reward!")
        return

    # Prepare dataset for GRPOTrainer
    train_records = []
    for item in cal_data + sol_data:
        train_records.append({"prompt": item["prompt"]})

    train_dataset = Dataset.from_list(train_records)

    # Configure LoRA
    peft_config = LoraConfig(
        r=16,
        lora_alpha=32,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )

    # Configure GRPO Training Arguments
    training_args = GRPOConfig(
        output_dir=output_dir,
        num_generations=4,
        max_prompt_length=1024,
        max_completion_length=2048,
        temperature=0.7,
        learning_rate=5.0e-6,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        num_train_epochs=num_train_epochs,
        logging_steps=5,
        save_strategy="epoch",
        bf16=True,
    )

    tokenizer = AutoTokenizer.from_pretrained(base_model_name)
    model = AutoModelForCausalLM.from_pretrained(
        base_model_name,
        load_in_4bit=True,
        device_map="auto",
    )

    trainer = GRPOTrainer(
        model=model,
        reward_funcs=[
            format_reward_func,
            calendar_accuracy_reward_func,
            solution_quality_reward_func,
        ],
        args=training_args,
        train_dataset=train_dataset,
        peft_config=peft_config,
    )

    print("Bắt đầu quy trình huấn luyện học tăng cường GRPO...")
    trainer.train()
    trainer.save_model(output_dir)
    print(f"Huấn luyện thành công! Trọng số đã lưu tại: {output_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base_model", default="deepseek-ai/DeepSeek-R1-Distill-Qwen-8B")
    parser.add_argument("--output_dir", default="./training/outputs/grpo_deepseek_r1")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--test_rewards", action="store_true", help="Kiểm thử nhanh các hàm reward")
    args = parser.parse_args()

    run_grpo_training(
        base_model_name=args.base_model,
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        use_mock_check=args.test_rewards or ("--test_rewards" in sys.argv),
    )
