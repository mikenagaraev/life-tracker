import type { CatNode, Currency, OpType } from './types';

export const CURRENCIES: Currency[] = [
  { code: 'GEL', sym: '₾', name: 'Лари' },
  { code: 'USD', sym: '$', name: 'Доллар' },
  { code: 'EUR', sym: '€', name: 'Евро' },
  { code: 'BYN', sym: 'Br', name: 'Белорусский рубль' },
  { code: 'RUB', sym: '₽', name: 'Российский рубль' },
  { code: 'TRY', sym: '₺', name: 'Турецкая лира' },
  { code: 'AMD', sym: '֏', name: 'Армянский драм' },
  { code: 'AZN', sym: '₼', name: 'Азербайджанский манат' },
  { code: 'KZT', sym: '₸', name: 'Тенге' },
  { code: 'UAH', sym: '₴', name: 'Гривна' },
  { code: 'PLN', sym: 'zł', name: 'Злотый' },
  { code: 'CZK', sym: 'Kč', name: 'Чешская крона' },
  { code: 'GBP', sym: '£', name: 'Фунт' },
  { code: 'CHF', sym: 'Fr', name: 'Швейцарский франк' },
  { code: 'AED', sym: 'Dh', name: 'Дирхам ОАЭ' },
  { code: 'ILS', sym: '₪', name: 'Шекель' },
  { code: 'CNY', sym: '¥', name: 'Юань' },
  { code: 'JPY', sym: '¥', name: 'Иена' },
  { code: 'THB', sym: '฿', name: 'Бат' },
  { code: 'INR', sym: '₹', name: 'Индийская рупия' },
  { code: 'CAD', sym: 'C$', name: 'Канадский доллар' },
  { code: 'AUD', sym: 'A$', name: 'Австралийский доллар' },
];

export const DEFAULT_MINE = ['GEL', 'USD'];

export function currency(code: string): Currency {
  return CURRENCIES.find((c) => c.code === code) || { code, sym: code, name: code };
}

export const QUICK: Record<OpType, string[]> = {
  exp: ['Подарок', 'Обед', 'Как вкусно', 'Давно хотел', 'Импульсивно'],
  inc: ['Онлайн', 'Новый клиент', 'Постоянный клиент', 'Предоплата'],
  oth: ['Обмен', 'Вернуть до…', 'Наличные'],
};

type Seed = [string, string, (string | [string, string[]])[]?];

const EXP: Seed[] = [
  ['food', 'Еда', ['Магазин', 'Кофейня', ['Ресторан', ['Обед', 'Ужин', 'С друзьями']], 'Готовая еда', 'Доставка']],
  ['transport', 'Транспорт', ['Общественный', 'Такси', 'Межгород', 'Самолёт']],
  ['home', 'Жильё', ['Аренда', 'Коммуналка', 'Для дома']],
  ['travel', 'Поездки', ['Отель', 'Места и экскурсии', 'Виза и страховка']],
  ['leisure', 'Досуг', ['Бильярд', 'Баня', 'Боулинг', 'Матчи', 'Кино и концерты']],
  ['music', 'Музыка', ['Студия', 'Вокал', 'Барабаны', 'Сведение и мастеринг', 'Мероприятия']],
  ['growth', 'Учёба', ['Психология', 'Личная терапия', 'Испанский', 'Курсы', 'Книги']],
  ['spirit', 'Духовность', ['Сессия', 'Клуб', 'Практики']],
  ['health', 'Здоровье', ['Спорт', 'Аптека', 'Врачи']],
  ['gift', 'Подарки'],
  ['subs', 'Подписки', ['Приложения и AI', 'Связь', 'Сервисы']],
  ['finance', 'Финансы', ['Налоги', 'Комиссии банка', 'Инвестиции']],
  ['shop', 'Магазин'],
  ['other', 'Другое'],
];
const INC: Seed[] = [
  ['salary', 'Зарплата'],
  ['consult', 'Консультация', ['Онлайн', 'Очно']],
  ['interview', 'Интервью'],
  ['fee', 'Гонорар'],
  ['bonus', 'Бонус'],
  ['apps', 'Приложения'],
  ['other', 'Другое'],
];
const OTH: Seed[] = [
  ['exchange', 'Обмен валюты'],
  ['transfer', 'Перевод себе'],
  ['lend', 'Дал в долг'],
  ['repaid', 'Вернули долг'],
  ['cash', 'Снял наличные'],
  ['other', 'Другое'],
];

function seed(type: OpType, list: Seed[]): CatNode[] {
  const out: CatNode[] = [];
  const kids = (parent: string, items: (string | [string, string[]])[]) =>
    items.forEach((it, i) => {
      const id = `${parent}-${i}`;
      if (typeof it === 'string') out.push({ id, name: it, type, parent, order: i });
      else {
        out.push({ id, name: it[0], type, parent, order: i });
        kids(id, it[1]);
      }
    });
  list.forEach(([key, name, children], i) => {
    const id = `${type}-${key}`;
    out.push({ id, name, type, parent: null, order: i, icon: key });
    if (children) kids(id, children);
  });
  return out;
}

export const DEFAULT_CATS: CatNode[] = [...seed('exp', EXP), ...seed('inc', INC), ...seed('oth', OTH)];
