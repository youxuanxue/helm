#!/usr/bin/env node
import { Command } from "commander";
import { cmdInit } from "./commands/init";
import { cmdDemand } from "./commands/demand";
import { cmdStatus } from "./commands/status";
import { cmdApprove } from "./commands/approve";
import { cmdBudget } from "./commands/budget";

const program = new Command();

program
  .name("helm")
  .description("Helm CLI - 单人公司 × AI 团队")
  .version("0.1.0");

program
  .command("init")
  .description("创建公司（可选模板或手工填写）")
  .option("-t, --template <id>", "模板 ID")
  .option("-n, --name <name>", "公司名称")
  .option("-m, --mission <mission>", "公司目标")
  .option("-a, --target-audience <audience>", "服务对象")
  .action(async (opts) => {
    await cmdInit(opts);
  });

program
  .command("demand <company-id> <demand>")
  .description("提需求")
  .action(async (companyId, demand) => {
    await cmdDemand(companyId, demand);
  });

program
  .command("status <company-id>")
  .description("查看公司状态")
  .action(async (companyId) => {
    await cmdStatus(companyId);
  });

program
  .command("approve <approval-id>")
  .description("审批通过")
  .action(async (approvalId) => {
    await cmdApprove(approvalId);
  });

program
  .command("budget <company-id> <amount-cents>")
  .description("设置预算（分）")
  .action(async (companyId, amountCents) => {
    await cmdBudget(companyId, parseInt(amountCents, 10));
  });

program.parse();
