import { Checkbox, Description, Label } from '@heroui/react'
import { useTranslation } from 'react-i18next'
import { normalizeAllergenKey } from './helpers'

interface CheckboxGroupProps {
  keys: string[]
  namespace: 'allergens' | 'intolerances'
  predefined: string[]
  onToggle: (key: string) => void
}

const CheckboxGroup = ({
  keys,
  namespace,
  predefined,
  onToggle,
}: CheckboxGroupProps) => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-3 pt-1">
      {keys.map((key) => {
        const normalizedKey = normalizeAllergenKey(key)
        const desc = t(`${namespace}.${normalizedKey}_desc`, {
          defaultValue: '',
        })

        return (
          <Checkbox
            key={key}
            isSelected={predefined.includes(key)}
            onChange={() => onToggle(key)}
          >
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              <Label>{t(`${namespace}.${normalizedKey}`)}</Label>
              {desc && <Description>{desc}</Description>}
            </Checkbox.Content>
          </Checkbox>
        )
      })}
    </div>
  )
}

export default CheckboxGroup
