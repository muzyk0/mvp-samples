export interface EmployeeSeedRecord {
  id: number;
  firstName: string;
  lastName: string;
  patronymic: string;
  workEmail: string;
  mobilePhone: string;
  position: string;
  department: string;
  city: string;
  birthDate: Date;
  age: number;
  hireDate: Date;
  tenureYears: number;
  employmentType: string;
  isRemote: boolean;
  baseSalary: number;
  bonusSalary: number;
  totalSalary: number;
  performanceRating: number;
  isActive: boolean;
}

const NAMES = [
  'Алексей',
  'Дмитрий',
  'Екатерина',
  'Михаил',
  'Наталья',
  'Павел',
  'Светлана',
  'Татьяна',
  'Анна',
  'Иван',
];
const SURNAMES = [
  'Иванов',
  'Петров',
  'Сидоров',
  'Кузнецов',
  'Попов',
  'Васильев',
  'Соколов',
  'Михайлов',
  'Смирнов',
  'Фёдоров',
];
const PATRONYMICS = ['Александрович', 'Дмитриевич', 'Сергеевич', 'Андреевич'];
const POSITIONS = [
  'Junior Developer',
  'Middle Developer',
  'Senior Developer',
  'Team Lead',
  'Project Manager',
];
const DEPARTMENTS = [
  'Разработка',
  'Тестирование',
  'Аналитика',
  'Дизайн',
  'Маркетинг',
];
const CITIES = ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург'];
const EMPLOYMENT_TYPES = ['Полная занятость', 'Частичная занятость'];
const REFERENCE_DATE = new Date('2026-01-01');
const TRANSLIT_MAP: Record<string, string> = {
  й: 'y',
  ц: 'ts',
  у: 'u',
  к: 'k',
  е: 'e',
  ё: 'yo',
  н: 'n',
  г: 'g',
  ш: 'sh',
  щ: 'sch',
  з: 'z',
  х: 'h',
  ъ: '',
  ф: 'f',
  ы: 'y',
  в: 'v',
  а: 'a',
  п: 'p',
  р: 'r',
  о: 'o',
  л: 'l',
  д: 'd',
  ж: 'zh',
  э: 'e',
  я: 'ya',
  ч: 'ch',
  с: 's',
  м: 'm',
  и: 'i',
  т: 't',
  ь: '',
  б: 'b',
  ю: 'yu',
};

export function buildEmployeeSeedRecord(
  id: number,
  rng: () => number,
): EmployeeSeedRecord {
  const firstName = pickOne(NAMES, rng);
  const lastName = pickOne(SURNAMES, rng);
  const baseSalary = pickSalary(rng);
  const bonusSalary = randomInt(rng, 5000, 50000);
  const birthDate = randomDate(
    rng,
    new Date('1975-01-01'),
    new Date('2000-12-31'),
  );
  const hireDate = randomDate(
    rng,
    new Date('2015-01-01'),
    new Date('2024-12-31'),
  );

  return {
    id,
    firstName,
    lastName,
    patronymic: pickOne(PATRONYMICS, rng),
    workEmail: `${translit(firstName)}.${translit(lastName)}.${id}@company.local`,
    mobilePhone: `+7 9${randomInt(rng, 10, 99)} ${randomInt(rng, 100, 999)}-${randomInt(rng, 10, 99)}-${randomInt(rng, 10, 99)}`,
    position: pickOne(POSITIONS, rng),
    department: pickOne(DEPARTMENTS, rng),
    city: pickOne(CITIES, rng),
    birthDate,
    age: diffYears(birthDate, REFERENCE_DATE),
    hireDate,
    tenureYears: diffYears(hireDate, REFERENCE_DATE),
    employmentType: pickOne(EMPLOYMENT_TYPES, rng),
    isRemote: rng() > 0.4,
    baseSalary,
    bonusSalary,
    totalSalary: baseSalary + bonusSalary,
    performanceRating: Number((2.5 + rng() * 2.5).toFixed(1)),
    isActive: rng() > 0.15,
  };
}

export function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne<T>(items: T[], rng: () => number): T {
  if (items.length === 0) {
    throw new Error('pickOne requires a non-empty array');
  }

  return items[Math.floor(rng() * items.length)] ?? items[0];
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randomDate(rng: () => number, start: Date, end: Date): Date {
  return new Date(start.getTime() + rng() * (end.getTime() - start.getTime()));
}

function diffYears(from: Date, to: Date): number {
  const diffMs = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000)));
}

function pickSalary(rng: () => number): number {
  return randomInt(rng, 70_000, 280_000);
}

function translit(value: string): string {
  return value
    .toLowerCase()
    .split('')
    .map((char) => TRANSLIT_MAP[char] ?? char)
    .join('');
}
