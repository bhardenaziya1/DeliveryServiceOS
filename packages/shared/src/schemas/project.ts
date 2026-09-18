import { z } from "zod";
import { ProjectStatus } from "../types/enums";

export const projectStatusEnum = z.nativeEnum(ProjectStatus);

export const createProjectSchema = z.object({
  clientId: z.string().uuid("Select a client"),
  name: z.string().trim().min(2, "Project name is required").max(200),
  code: z
    .string()
    .trim()
    .min(2, "Project code is required")
    .max(30)
    .regex(/^[A-Z0-9_-]+$/, "Code must be uppercase letters, numbers, - or _"),
  status: projectStatusEnum.default(ProjectStatus.DRAFT),
  startDate: z.string().trim().min(1, "Start date is required"),
  endDate: z.string().trim().optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial().omit({ clientId: true });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export interface ProjectDto {
  id: string;
  tenantId: string;
  clientId: string;
  clientName: string;
  name: string;
  code: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
