import json
from typing import Any

from litellm.types.utils import ModelResponse

from openhands.core.exceptions import SummarizeError
from openhands.core.logger import openhands_logger as logger
from openhands.core.message import Message, TextContent
from openhands.events.action import AgentSummarizeAction
from openhands.llm.llm import LLM
from openhands.memory.utils import parse_summary_response
from openhands.utils.prompt import PromptManager


class MemoryCondenser:
    def __init__(self, llm: LLM, prompt_manager: PromptManager):
        self.llm = llm
        self.prompt_manager = prompt_manager

        # just easier to read
        self.context_window = llm.config.max_input_tokens

    def condense(
        self,
        messages: list[Message],
    ) -> AgentSummarizeAction:
        """
        Condenses a list of messages using the LLM and returns a summary action.

        Args:
            messages (list[Message]): The list of messages to condense.

        Returns:
            AgentSummarizeAction: The summary action containing the condensed summary.
        """
        assert (
            self.context_window is not None and self.context_window > 2000
        ), 'context window must be a number over 2000'

        # don't condense if under the token limit
        total_token_count = self.llm.get_token_count(messages)
        if total_token_count < self.context_window:
            logger.debug(
                f'Not condensing messages because token count ({total_token_count}) is less than max input tokens ({self.context_window})'
            )
            return AgentSummarizeAction(end_id=-1)

        # calculate safe token limit for processing (e.g. 80% of context window)
        safe_token_limit = int(
            self.context_window * self.llm.config.message_summary_warning_level
        )

        # collect condensable messages with their token counts
        condensable_messages: list[dict[str, Any]] = [
            {
                'message': msg,
                'token_count': self.llm.get_token_count([msg.model_dump()]),
            }
            for msg in messages
            if msg.condensable
        ]

        if len(condensable_messages) <= 1:
            # prevents potential infinite loop of summarizing the same message repeatedly
            raise SummarizeError(
                f"Summarize error: tried to run summarize, but couldn't find enough messages to compress [len={len(condensable_messages)} <= 1]"
            )

        # track the very first message's id - this will be our start_id
        first_message_id = condensable_messages[0]['message'].event_id

        # create chunks that fit within safe_token_limit
        chunks: list[list[Message]] = []
        current_chunk: list[Message] = []
        current_chunk_tokens = 0

        for message in condensable_messages:
            msg = message['message']
            token_count = message['token_count']
            if current_chunk_tokens + token_count > safe_token_limit:
                if current_chunk:  # save current chunk if not empty, it's done
                    chunks.append(current_chunk)
                    print(f'appending chunk with tokens: {current_chunk_tokens}')

                # start a new chunk with the current message
                current_chunk = [msg]
                current_chunk_tokens = token_count
            else:
                # add to current chunk
                current_chunk.append(msg)
                current_chunk_tokens += token_count

        # add the last chunk
        if current_chunk:
            chunks.append(current_chunk)

        print(f'chunks: {len(chunks)}')

        # process chunks
        final_summary = None
        # track the last real message id (note: not summary actions)
        last_real_message_id = condensable_messages[-1]['message'].event_id

        for i, chunk in enumerate(chunks):
            if final_summary is not None:
                # prepend previous summary to next chunk
                summary_message = Message(
                    role='user',
                    content=[TextContent(text=f'Previous summary:\n{final_summary}')],
                    condensable=True,
                    # Note: summary messages don't have an event_id
                    event_id=-1,
                )
                chunk.insert(0, summary_message)

            print(f'summarizing chunk {i} with length: {len(chunk)}')
            action_response = self._summarize_messages(chunk)
            summary_action = parse_summary_response(action_response)

            print('--------------------------------')
            print(f'summary action: {summary_action}')
            print(f'summary action summary: {summary_action.summary}')
            print('--------------------------------')

            final_summary = summary_action.summary

        # create final summary action
        assert final_summary is not None, 'final summary must not be None here'
        return AgentSummarizeAction(
            summary=final_summary,
            start_id=first_message_id,
            end_id=last_real_message_id,
        )

    def _summarize_messages(self, message_sequence_to_summarize: list[Message]) -> str:
        """Summarize a message sequence using LLM"""
        # Format the conversation history for the user message
        conversation_dicts = self.llm.format_messages_for_llm(
            message_sequence_to_summarize
        )
        conversation_text = json.dumps(conversation_dicts, indent=2)

        # Get the template as system message
        summarize_prompt = self.prompt_manager.get_summarize_prompt()
        system_message = Message(
            role='system', content=[TextContent(text=summarize_prompt)]
        )

        # Create user message with the conversation history
        user_message = Message(
            role='user',
            content=[
                TextContent(
                    text=f'----- Conversation History: ------\n{conversation_text}'
                )
            ],
        )

        # Send both messages to LLM
        messages = [system_message.model_dump(), user_message.model_dump()]

        response = self.llm.completion(
            messages=messages,
            temperature=0.2,
            override_token_limit=True,
        )

        print(f'summarize_messages got response: {response}')
        assert isinstance(response, ModelResponse), 'response must be a ModelResponse'
        return response.choices[0].message.content
