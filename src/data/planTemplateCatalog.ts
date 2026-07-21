import type { CategoryMeta } from '../types/roadmap'
import type { PlanTemplateKey, PlanningMode } from '../types/forgePlanner'

export interface PlanTemplateDefinition {
  id: PlanTemplateKey
  title: { en: string; es: string }
  description: { en: string; es: string }
  icon: string
  defaultTitle: { en: string; es: string }
  defaultObjective: { en: string; es: string }
  categories: CategoryMeta[]
  planningMode: PlanningMode
  savings?: { enabled: true; mode: 'monthly-target'; defaultMonthlyTarget: number }
}

const categories = (items: Array<[string, string, CategoryMeta['tone']]>) => items.map(([key, label, tone], index) => ({ key, label, tone, ...(index === 0 ? { isDefault: true } : {}) }))

export const planTemplateCatalog: PlanTemplateDefinition[] = [
  { id: 'blank', title: { en: 'Blank plan', es: 'Plan vacío' }, description: { en: 'Start with a clean canvas.', es: 'Empieza con un espacio en blanco.' }, icon: '＋', defaultTitle: { en: '', es: '' }, defaultObjective: { en: '', es: '' }, categories: categories([['general', 'General', 'slate']]), planningMode: 'auto' },
  { id: 'career-roadmap', title: { en: 'Career growth', es: 'Crecimiento profesional' }, description: { en: 'Build skills and professional milestones.', es: 'Desarrolla habilidades y logros profesionales.' }, icon: '↗', defaultTitle: { en: 'Career growth plan', es: 'Plan de crecimiento profesional' }, defaultObjective: { en: 'Grow my skills and career opportunities.', es: 'Desarrollar mis habilidades y oportunidades profesionales.' }, categories: categories([['skills', 'Skills', 'blue'], ['certifications', 'Certifications', 'rose'], ['milestones', 'Milestones', 'green'], ['networking', 'Networking', 'amber'], ['portfolio', 'Portfolio', 'green']]), planningMode: 'annual' },
  { id: 'certification-plan', title: { en: 'Study plan', es: 'Plan de estudio' }, description: { en: 'Organize learning and reviews.', es: 'Organiza aprendizaje y repasos.' }, icon: '▣', defaultTitle: { en: 'Study plan', es: 'Plan de estudio' }, defaultObjective: { en: 'Make steady progress in my studies.', es: 'Avanzar de forma constante en mis estudios.' }, categories: categories([['subjects', 'Subjects', 'blue'], ['milestones', 'Learning milestones', 'green'], ['reviews', 'Reviews', 'amber'], ['exams', 'Exams', 'rose'], ['projects', 'Projects', 'rose']]), planningMode: 'monthly' },
  { id: 'health-lifestyle', title: { en: 'Health plan', es: 'Plan de bienestar' }, description: { en: 'Build sustainable habits and routines.', es: 'Construye hábitos y rutinas sostenibles.' }, icon: '♡', defaultTitle: { en: 'Wellbeing plan', es: 'Plan de bienestar' }, defaultObjective: { en: 'Build healthier routines at my own pace.', es: 'Construir rutinas saludables a mi propio ritmo.' }, categories: categories([['habits', 'Habits', 'green'], ['activity', 'Activity', 'blue'], ['nutrition', 'Nutrition', 'amber'], ['check-ins', 'Check-ins', 'rose'], ['progress', 'Progress', 'green']]), planningMode: 'monthly' },
  { id: 'savings-goal', title: { en: 'Savings plan', es: 'Plan de ahorro' }, description: { en: 'Track contributions and checkpoints.', es: 'Registra aportaciones y objetivos.' }, icon: '$', defaultTitle: { en: 'Savings plan', es: 'Plan de ahorro' }, defaultObjective: { en: 'Reach my savings goal with steady contributions.', es: 'Alcanzar mi meta de ahorro con aportaciones constantes.' }, categories: categories([['goal', 'Savings goal', 'green'], ['contributions', 'Contributions', 'blue'], ['expenses', 'Expenses', 'rose'], ['checkpoints', 'Checkpoints', 'rose'], ['progress', 'Progress', 'green']]), planningMode: 'monthly', savings: { enabled: true, mode: 'monthly-target', defaultMonthlyTarget: 300 } },
  { id: 'immigration-plan', title: { en: 'Lifestyle plan', es: 'Plan de estilo de vida' }, description: { en: 'Balance routines, projects and life improvements.', es: 'Equilibra rutinas, proyectos y mejoras personales.' }, icon: '✦', defaultTitle: { en: 'Lifestyle plan', es: 'Plan de estilo de vida' }, defaultObjective: { en: 'Make room for the routines and projects that matter.', es: 'Dar espacio a las rutinas y proyectos importantes.' }, categories: categories([['routines', 'Routines', 'blue'], ['projects', 'Personal projects', 'rose'], ['family', 'Family', 'rose'], ['recreation', 'Recreation', 'green'], ['home', 'Home improvements', 'amber']]), planningMode: 'annual' },
]

export const getPlanTemplate = (id: PlanTemplateKey) => planTemplateCatalog.find((template) => template.id === id) ?? planTemplateCatalog[0]
