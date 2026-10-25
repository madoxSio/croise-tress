import {
  wordListListSchema,
  wordListSchema,
  type Difficulty,
  type WordListDto,
  type WordListList,
} from '@crossverse/contracts'
import { query, request, segment } from '~/services/api'

/** Mots mêlés « standard » : lecture publique, la partie se joue ensuite dans le navigateur. */
export function listWordLists(
  params: { difficulty?: Difficulty; theme?: string; limit?: number; cursor?: string } = {},
): Promise<WordListList> {
  return request(
    'GET',
    `/word-lists${query({
      difficulty: params.difficulty,
      theme: params.theme,
      limit: params.limit,
      cursor: params.cursor,
    })}`,
    wordListListSchema,
  )
}

export function getWordList(id: string): Promise<WordListDto> {
  return request('GET', `/word-lists/${segment(id)}`, wordListSchema)
}
